import type { Query } from "@evolu/common"
import {
  createIdFromString,
  err,
  type InsertValues,
  type MutationOptions,
  ok,
  type Result,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluSchema } from "@/core/evolu/schema.ts"
import {
  cashRegisterAccountByIdQuery,
  ibanAccountByIdQuery,
} from "@/core/modules/account/account-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  computeAccountTransactionRows,
  upsertAccountTransactionRows,
} from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { requireBillAcceptingPayment } from "@/core/modules/bill/bill-guards.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import type {
  PaymentRow,
  payment,
  paymentBtc,
  paymentBtcLightning,
  paymentBtcSpark,
  paymentCashRegister,
  paymentIban,
} from "@/core/modules/payment/payment.ts"
import { snapshotBillLinesForPayment } from "@/core/modules/payment-line/payment-line-actions.ts"
import {
  createPaymentNumberDate,
  loadNextPaymentNumber,
  upsertPaymentNumberRows,
} from "@/core/modules/payment-number/payment-number-actions.ts"
import {
  loadBillClosedAtForPayment,
  upsertReconciliationClaimRows,
} from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import {
  activeClaimedTransactionsByPaymentIdQuery,
  activeReconciliationClaimsByPaymentIdQuery,
} from "@/core/modules/reconciliation-claim/reconciliation-claim-queries.ts"
import { sumDistinctClaimedAmounts } from "@/core/modules/shared/claimed-amount.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createRowId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  assertHasSparkIdentifier,
  type WithSparkDetails,
} from "@/core/spark/spark-details.ts"
import {
  type FiatCurrency,
  type NonEmptyString,
  type TimestampMs,
  TimestampMsSchema,
} from "../shared/schema.ts"
import {
  type AccountCurrencyMismatchError,
  type CreatePaymentError,
  createAccountCurrencyMismatchError,
  createCashRegisterAccountNotFoundError,
  createIbanAccountNotFoundError,
  createPaymentAlreadyPaidError,
  createPaymentNotCanceledError,
  createPaymentNotClaimedError,
  createPaymentNotFoundError,
  createPaymentNotOverpaidError,
  type MarkPaymentPaidCashError,
  type MarkPaymentPaidIbanError,
  type PaymentAlreadyPaidError,
  type PaymentNotCanceledError,
  type PaymentNotClaimedError,
  type PaymentNotFoundError,
  type PaymentNotOverpaidError,
} from "./payment-errors.ts"
import { paymentByIdQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"
/**
 * Shared "load the first row or fail, then check its currency matches" step
 * behind both `preparePaymentMethod`'s cash-register/IBAN branches and
 * `markPaymentPaidCash`.
 */
export const loadAccountWithCurrencyCheck = <
  TRow extends { readonly currency: FiatCurrency },
  TNotFoundError,
>({
  rows,
  notFoundError,
  accountKind,
  accountId,
  expectedCurrency,
}: {
  readonly rows: ReadonlyArray<TRow>
  readonly notFoundError: TNotFoundError
  readonly accountKind: "cashRegister" | "iban"
  readonly accountId: AccountId
  readonly expectedCurrency: FiatCurrency
}): Result<TRow, TNotFoundError | AccountCurrencyMismatchError> => {
  const accountResult = getFirstOr(rows, notFoundError)
  if (!accountResult.ok) return accountResult

  const account = accountResult.value
  if (account.currency !== expectedCurrency) {
    return err(
      createAccountCurrencyMismatchError({
        accountKind,
        id: accountId,
        accountCurrency: account.currency,
        paymentCurrency: expectedCurrency,
      })
    )
  }

  return ok(account)
}

export type PaymentBtcInput = WithSparkDetails<
  Omit<InsertValues<typeof paymentBtc>, "id">,
  Omit<InsertValues<typeof paymentBtcLightning>, "id">,
  Omit<InsertValues<typeof paymentBtcSpark>, "id">
>

type PaymentBtcUpdateInput = WithSparkDetails<
  Omit<UpdateValues<typeof paymentBtc>, "id">,
  Omit<UpdateValues<typeof paymentBtcLightning>, "id">,
  Omit<UpdateValues<typeof paymentBtcSpark>, "id">
>

/**
 * Writes a payment's Spark detail rows: the `paymentBtc` base row plus
 * whichever of `paymentBtcLightning`/`paymentBtcSpark` the quote produced.
 * Shared by `createPayment` and `preparePaymentMethod`, which must agree on
 * exactly this field set — a payment prepared through one path would
 * otherwise carry different Spark details than through the other.
 *
 * Upsert only. `updatePayment` writes the same three tables with `update`,
 * whose values are all-optional where `UpsertValues` requires every
 * non-nullable column, so folding both modes in here would mean widening this
 * to accept a partial `paymentBtc` — losing the guarantee that a created
 * payment has a complete Spark row.
 */
export const upsertPaymentSparkDetails = (
  evolu: EvoluDep["evolu"],
  id: PaymentId,
  spark: PaymentBtcInput,
  options: MutationOptions
): void => {
  evolu.upsert(
    "paymentBtc",
    removeUndefinedValues({
      accountId: spark.accountId,
      amountSats: spark.amountSats,
      exchangeRate: spark.exchangeRate,
      exchangeRateSource: spark.exchangeRateSource,
      exchangeRateFetchedAt: spark.exchangeRateFetchedAt,
      id,
    }),
    options
  )
  if (spark.lightning) {
    evolu.upsert(
      "paymentBtcLightning",
      removeUndefinedValues({ ...spark.lightning, id }),
      options
    )
  }
  if (spark.sparkInvoice) {
    evolu.upsert(
      "paymentBtcSpark",
      removeUndefinedValues({ ...spark.sparkInvoice, id }),
      options
    )
  }
}

export const loadPayment =
  (idValue: PaymentId): Task<PaymentRow, PaymentNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(paymentByIdQuery(idValue)),
      createPaymentNotFoundError({ id: idValue })
    )

export const createPayment =
  ({
    cashRegister,
    spark,
    iban,
    ...input
  }: InsertValues<typeof payment> & {
    readonly cashRegister?: Omit<InsertValues<typeof paymentCashRegister>, "id">
    readonly spark?: PaymentBtcInput
    readonly iban?: Omit<InsertValues<typeof paymentIban>, "id">
  }): Task<
    PaymentId,
    CreatePaymentError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    assertHasSparkIdentifier(
      spark,
      "Spark payment requires lnInvoice or sparkInvoice."
    )

    // A new payment attempt requires the bill to still be `open` — but does
    // not check for an already-pending payment on it: split payments mean
    // more than one payment can legitimately be in flight for the same bill
    // at once. See docs/bill-payment-states.md.
    // Frozen for `snapshotBillLinesForPayment` below — captured from this
    // device's own local view, before the mutation batch, since it can't be
    // reliably reconstructed later from `billLine.createdAt` (see that
    // function's doc comment). Taken off the guard's own result rather than
    // reloaded after it: the guard derives the bill's status from exactly
    // this projection, so this both saves a second sequential round trip and
    // freezes the same read the guard just accepted.
    const billId = input.billId ?? null
    let billLineSnapshot: ReadonlyArray<BillLineSummary> | null = null
    if (billId !== null) {
      const openResult = await run(requireBillAcceptingPayment(billId))
      if (!openResult.ok) return openResult
      billLineSnapshot = openResult.value.items
    }

    const id = createRowId<"Payment">()
    const { evoluOwnerId } = run.deps
    const paymentNumber = await run.ok(
      loadNextPaymentNumber({
        id,
        date: createPaymentNumberDate(run.deps.date.now()),
      })
    )

    await runMutationWithCompletion((options) => {
      upsertPaymentNumberRows(run.deps.evolu, paymentNumber, {
        ...options,
        ownerId: evoluOwnerId,
      })

      if (cashRegister) {
        run.deps.evolu.upsert(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      if (spark) {
        upsertPaymentSparkDetails(run.deps.evolu, id, spark, {
          ...options,
          ownerId: evoluOwnerId,
        })
      }

      if (iban) {
        run.deps.evolu.upsert(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      if (billLineSnapshot !== null) {
        snapshotBillLinesForPayment(run.deps.evolu, id, billLineSnapshot, {
          ...options,
          ownerId: evoluOwnerId,
        })
      }

      return run.deps.evolu.upsert(
        "payment",
        removeUndefinedValues({
          ...input,
          id,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(id)
  }

export const updatePayment =
  ({
    cashRegister,
    spark,
    iban,
    ...input
  }: Pick<
    UpdateValues<typeof payment>,
    | "id"
    | "deviceId"
    | "billId"
    | "tableId"
    | "amount"
    | "currency"
    | "tipAmount"
    | "canceledAt"
  > & {
    readonly cashRegister?: Omit<UpdateValues<typeof paymentCashRegister>, "id">
    readonly spark?: PaymentBtcUpdateInput
    readonly iban?: Omit<UpdateValues<typeof paymentIban>, "id">
  }): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      if (cashRegister) {
        run.deps.evolu.update(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      if (spark) {
        run.deps.evolu.update(
          "paymentBtc",
          removeUndefinedValues({
            accountId: spark.accountId,
            amountSats: spark.amountSats,
            exchangeRate: spark.exchangeRate,
            exchangeRateSource: spark.exchangeRateSource,
            exchangeRateFetchedAt: spark.exchangeRateFetchedAt,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
        if (spark.lightning) {
          run.deps.evolu.update(
            "paymentBtcLightning",
            removeUndefinedValues({
              ...spark.lightning,
              id: input.id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
        if (spark.sparkInvoice) {
          run.deps.evolu.update(
            "paymentBtcSpark",
            removeUndefinedValues({
              ...spark.sparkInvoice,
              id: input.id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
      }

      if (iban) {
        run.deps.evolu.update(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
      }

      return run.deps.evolu.update("payment", removeUndefinedValues(input), {
        ...options,
        ownerId: evoluOwnerId,
      })
    })

    return ok(input.id)
  }

export const deletePayment =
  (paymentId: PaymentId): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          isDeleted: sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }

interface MarkPaymentPaidInput {
  readonly paymentId: PaymentId
  readonly accountId: AccountId
  readonly deviceId?: DeviceId | null
  readonly occurredAt?: TimestampMs
  readonly note?: NonEmptyString | null
}

/**
 * Records staff confirming that money for a payment arrived on one of their
 * own accounts, as an `accountTransaction` claimed against that payment.
 *
 * The account kind is the only thing that varies: which query finds it, which
 * not-found error it reports, and the prefix of the transaction's id. That id
 * is content-derived so a retried confirmation re-uses the row instead of
 * recording the money twice — the two prefixes are deliberately passed in
 * verbatim rather than assembled from `accountKind`, because they are *not*
 * symmetrical (the IBAN one carries a `manual` segment, the cash one does
 * not) and changing either would duplicate a settlement for every payment
 * already confirmed.
 */
const markPaymentPaid =
  <TRow extends { readonly currency: FiatCurrency }, TNotFoundError>({
    accountKind,
    accountQuery,
    notFoundError,
    transactionIdPrefix,
    paymentId,
    accountId,
    deviceId,
    occurredAt,
    note,
  }: MarkPaymentPaidInput & {
    readonly accountKind: "cashRegister" | "iban"
    readonly accountQuery: (accountId: AccountId) => Query<EvoluSchema, TRow>
    readonly notFoundError: TNotFoundError
    readonly transactionIdPrefix: string
  }): Task<
    PaymentId,
    PaymentNotFoundError | TNotFoundError | AccountCurrencyMismatchError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult

    const payment = paymentResult.value
    const accountResult = loadAccountWithCurrencyCheck({
      rows: await run.deps.evolu.loadQuery(accountQuery(accountId)),
      notFoundError,
      accountKind,
      accountId,
      expectedCurrency: payment.currency,
    })
    if (!accountResult.ok) return accountResult

    // Computed up front rather than written through `createAccountTransaction`
    // and `claimManualReconciliation` as two separate mutation batches: the
    // account transaction's id is content-derived (no write needed to learn
    // it), and `loadBillClosedAtForPayment` reads only already-committed data
    // plus this not-yet-written claim's own values — so both writes can join
    // one batch below instead of leaving a window where the money moved but
    // nothing claims it (a crash or failed second batch used to strand it
    // there permanently).
    const accountTransaction = computeAccountTransactionRows(
      {
        id: createIdFromString<"AccountTransaction">(
          `${transactionIdPrefix}${paymentId}:${accountId}`
        ),
        accountId,
        amount: payment.amount,
        currency: payment.currency,
        occurredAt:
          occurredAt ?? TimestampMsSchema.decode(run.deps.date.now().getTime()),
        note: note ?? null,
        internalTransferGroupId: null,
        source: {
          deviceId: deviceId ?? null,
          source: "manual",
        },
      },
      run.deps.date.now()
    )
    const claim = {
      id: createIdFromString<"ReconciliationClaim">(
        `reconciliationClaim:manual:${paymentId}:${accountTransaction.id}`
      ),
      deviceId: deviceId ?? null,
      paymentId,
      accountTransactionId: accountTransaction.id,
      source: "manual" as const,
      claimedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
    }
    const billClosing = await run.ok(
      loadBillClosedAtForPayment(paymentId, {
        id: accountTransaction.id,
        amount: accountTransaction.input.amount,
        currency: accountTransaction.input.currency,
      })
    )

    const { evoluOwnerId } = run.deps
    await runMutationWithCompletion((options) => {
      upsertAccountTransactionRows(run.deps.evolu, accountTransaction, {
        ...options,
        ownerId: evoluOwnerId,
      })
      upsertReconciliationClaimRows(run.deps.evolu, claim, billClosing, {
        ...options,
        ownerId: evoluOwnerId,
      })
    })

    return ok(paymentId)
  }

export const markPaymentPaidCash = (
  input: MarkPaymentPaidInput
): Task<
  PaymentId,
  MarkPaymentPaidCashError,
  EvoluDep & EvoluOwnerIdDep & DateDep
> =>
  markPaymentPaid({
    ...input,
    accountKind: "cashRegister",
    accountQuery: cashRegisterAccountByIdQuery,
    notFoundError: createCashRegisterAccountNotFoundError({
      id: input.accountId,
    }),
    transactionIdPrefix: "accountTransaction:cashRegister:payment:",
  })

/**
 * Manual counterpart to the Fio-plugin auto-settlement: staff confirming
 * they've checked their bank and the transfer for this payment arrived,
 * since the auto-detection sync job only runs in the native app.
 */
export const markPaymentPaidIban = (
  input: MarkPaymentPaidInput
): Task<
  PaymentId,
  MarkPaymentPaidIbanError,
  EvoluDep & EvoluOwnerIdDep & DateDep
> =>
  markPaymentPaid({
    ...input,
    accountKind: "iban",
    accountQuery: ibanAccountByIdQuery,
    notFoundError: createIbanAccountNotFoundError({ id: input.accountId }),
    transactionIdPrefix: "accountTransaction:iban:manual:payment:",
  })

export const cancelPayment =
  (
    paymentId: PaymentId
  ): Task<
    PaymentId,
    PaymentAlreadyPaidError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    // A payment that already has an active claim (money arrived) cannot be
    // canceled — mirrors the bill-side guard that a paid bill cannot be
    // canceled. A concurrent multi-device merge can still race past this on
    // a single device's check; that residual case is resolved by
    // `derivePaymentStatus`'s precedence, not by this guard. See
    // docs/bill-payment-states.md.
    const activeClaims = await run.deps.evolu.loadQuery(
      activeReconciliationClaimsByPaymentIdQuery(paymentId)
    )
    if (activeClaims.length > 0) {
      return err(createPaymentAlreadyPaidError({ id: paymentId }))
    }

    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          canceledAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }

export type ConfirmPaymentPaidDespiteCancellationError =
  | PaymentNotFoundError
  | PaymentNotCanceledError
  | PaymentNotClaimedError

/**
 * Resolves the canceled+claimed collision described in
 * docs/bill-payment-states.md: a multi-device merge can leave a payment with
 * both `canceledAt` set and an active `reconciliationClaim` — money that
 * genuinely arrived — which `derivePaymentStatus` displays as Canceled by
 * default. This lets staff explicitly acknowledge that and flip the
 * *display* back to Paid via `confirmedPaidAt`, set once and never cleared,
 * mirroring `canceledAt`'s own style.
 *
 * Requires both `canceledAt` and an active claim to already be set — this
 * resolves an existing collision, it does not create a way to mark an
 * arbitrary payment paid without a claim behind it. Coverage math keeps
 * reading claims only; this field never feeds into it.
 */
export const confirmPaymentPaidDespiteCancellation =
  (
    paymentId: PaymentId
  ): Task<
    PaymentId,
    ConfirmPaymentPaidDespiteCancellationError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult
    if (paymentResult.value.canceledAt === null) {
      return err(createPaymentNotCanceledError({ id: paymentId }))
    }

    const activeClaims = await run.deps.evolu.loadQuery(
      activeReconciliationClaimsByPaymentIdQuery(paymentId)
    )
    if (activeClaims.length === 0) {
      return err(createPaymentNotClaimedError({ id: paymentId }))
    }

    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          confirmedPaidAt: TimestampMsSchema.decode(
            run.deps.date.now().getTime()
          ),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }

export type AcknowledgePaymentExcessSettlementError =
  | PaymentNotFoundError
  | PaymentNotOverpaidError

/**
 * Resolves the duplicate-settlement collision described in
 * docs/bill-payment-states.md and `payment.ts`'s `excessAcknowledgedAt` doc
 * comment: two offline devices can each independently claim the same
 * payment through a different method (e.g. one settles it in cash while
 * another reconciles a matching incoming bank transfer), and since each
 * claim is real money, neither is discarded on merge — the payment simply
 * ends up claimed for more than its own `amount`.
 *
 * This lets staff explicitly acknowledge that (e.g. once they've refunded
 * the excess, or decided to keep it) via `excessAcknowledgedAt`, set once
 * and never cleared. Requires the payment to actually be claimed for more
 * than its `amount` — this resolves an existing collision, it does not
 * silence a warning that isn't there.
 */
export const acknowledgePaymentExcessSettlement =
  (
    paymentId: PaymentId
  ): Task<
    PaymentId,
    AcknowledgePaymentExcessSettlementError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult

    const claimedTransactions = await run.deps.evolu.loadQuery(
      activeClaimedTransactionsByPaymentIdQuery(paymentId)
    )
    const claimedSum = sumDistinctClaimedAmounts(claimedTransactions)
    if (claimedSum <= paymentResult.value.amount) {
      return err(createPaymentNotOverpaidError({ id: paymentId }))
    }

    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          excessAcknowledgedAt: TimestampMsSchema.decode(
            run.deps.date.now().getTime()
          ),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }
