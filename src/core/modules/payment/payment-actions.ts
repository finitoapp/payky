import {
  createIdFromString,
  err,
  type InsertValues,
  ok,
  type Result,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type {
  DateDep,
  EvoluOwnerIdDep,
  FetchDep,
  FetchError,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  fetchYadioBtcExchangeRate,
  type YadioApiDep,
  type YadioApiError,
  type YadioHttpError,
} from "@/core/integrations/yadio/yadio-client.ts"
import {
  cashRegisterAccountByIdQuery,
  ibanAccountByIdQuery,
} from "@/core/modules/account/account-queries.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type {
  BillNotFoundError,
  BillNotOpenError,
} from "@/core/modules/bill/bill-actions.ts"
import { requireBillAcceptingPayment } from "@/core/modules/bill/bill-actions.ts"
import { loadCalculatedBillLineSummaries } from "@/core/modules/bill-line/bill-line-actions.ts"
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
import {
  calculatePaymentClaimedSum,
  computePaymentExpiresAt,
} from "@/core/modules/payment/payment-status-utils.ts"
import { snapshotBillLinesForPayment } from "@/core/modules/payment-line/payment-line-actions.ts"
import {
  createPaymentNumberDate,
  loadNextPaymentNumber,
  upsertPaymentNumberRows,
} from "@/core/modules/payment-number/payment-number-actions.ts"
import { paymentNumberByPaymentIdQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import { claimManualReconciliation } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import {
  activeClaimedTransactionsByPaymentIdQuery,
  activeReconciliationClaimsByPaymentIdQuery,
} from "@/core/modules/reconciliation-claim/reconciliation-claim-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import type { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  assertHasSparkIdentifier,
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
  type WithSparkDetails,
} from "@/core/modules/shared/utils.ts"
import type { SparkWalletDep } from "@/core/spark/spark-wallet.ts"
import {
  type DateString,
  type FiatCurrency,
  type NonEmptyString,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
  SpecificSymbol,
  type TimestampMs,
  TimestampMsSchema,
  VariableSymbol,
} from "../shared/schema.ts"
import {
  paymentByIdQuery,
  paymentNonExpiringMethodsByIdQuery,
} from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

const SATS_PER_BTC = 100_000_000
const FIAT_MINOR_UNITS = 100

const createPaymentNotFoundError = defineError("PaymentNotFound")<{
  readonly id: PaymentId
}>()
export type PaymentNotFoundError = ReturnType<typeof createPaymentNotFoundError>

const createPaymentAlreadyPaidError = defineError("PaymentAlreadyPaid")<{
  readonly id: PaymentId
}>()
export type PaymentAlreadyPaidError = ReturnType<
  typeof createPaymentAlreadyPaidError
>

const createPaymentNotCanceledError = defineError("PaymentNotCanceled")<{
  readonly id: PaymentId
}>()
export type PaymentNotCanceledError = ReturnType<
  typeof createPaymentNotCanceledError
>

const createPaymentNotClaimedError = defineError("PaymentNotClaimed")<{
  readonly id: PaymentId
}>()
export type PaymentNotClaimedError = ReturnType<
  typeof createPaymentNotClaimedError
>

const createPaymentNotOverpaidError = defineError("PaymentNotOverpaid")<{
  readonly id: PaymentId
}>()
export type PaymentNotOverpaidError = ReturnType<
  typeof createPaymentNotOverpaidError
>

const createAccountSparkNotFoundError = defineError("AccountSparkNotFound")<{
  readonly id: AccountId
}>()
export type AccountSparkNotFoundError = ReturnType<
  typeof createAccountSparkNotFoundError
>

const createPaymentPreparationFailedError = defineError(
  "PaymentPreparationFailed"
)<{
  readonly message: string
}>()
export type PaymentPreparationFailedError = ReturnType<
  typeof createPaymentPreparationFailedError
>

const createPaymentNumberNotFoundError = defineError("PaymentNumberNotFound")<{
  readonly paymentId: PaymentId
}>()
export type PaymentNumberNotFoundError = ReturnType<
  typeof createPaymentNumberNotFoundError
>

const createCashRegisterAccountNotFoundError = defineError(
  "CashRegisterAccountNotFound"
)<{
  readonly id: AccountId
}>()
export type CashRegisterAccountNotFoundError = ReturnType<
  typeof createCashRegisterAccountNotFoundError
>

const createIbanAccountNotFoundError = defineError("IbanAccountNotFound")<{
  readonly id: AccountId
}>()
export type IbanAccountNotFoundError = ReturnType<
  typeof createIbanAccountNotFoundError
>

const createAccountCurrencyMismatchError = defineError(
  "AccountCurrencyMismatch"
)<{
  readonly accountKind: "cashRegister" | "iban"
  readonly id: AccountId
  readonly accountCurrency: FiatCurrency
  readonly paymentCurrency: FiatCurrency
}>()
export type AccountCurrencyMismatchError = ReturnType<
  typeof createAccountCurrencyMismatchError
>

export type CreatePreparedPaymentError =
  | AccountSparkNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError
  | YadioApiError
  | FetchError
  | CreatePaymentError

export type MarkPaymentPaidCashError =
  | PaymentNotFoundError
  | CashRegisterAccountNotFoundError
  | AccountCurrencyMismatchError

export type MarkPaymentPaidIbanError =
  | PaymentNotFoundError
  | IbanAccountNotFoundError
  | AccountCurrencyMismatchError

export type PreparePaymentMethodError =
  | PaymentNotFoundError
  | CashRegisterAccountNotFoundError
  | AccountCurrencyMismatchError
  | AccountSparkNotFoundError
  | IbanAccountNotFoundError
  | PaymentNumberNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError
  | YadioApiError
  | FetchError

export const paymentNotFound = (id: PaymentId): PaymentNotFoundError =>
  createPaymentNotFoundError({ id })

export const paymentAlreadyPaid = (id: PaymentId): PaymentAlreadyPaidError =>
  createPaymentAlreadyPaidError({ id })

export const paymentNotCanceled = (id: PaymentId): PaymentNotCanceledError =>
  createPaymentNotCanceledError({ id })

export const paymentNotClaimed = (id: PaymentId): PaymentNotClaimedError =>
  createPaymentNotClaimedError({ id })

export const paymentNotOverpaid = (id: PaymentId): PaymentNotOverpaidError =>
  createPaymentNotOverpaidError({ id })

export const accountSparkNotFound = (
  id: AccountId
): AccountSparkNotFoundError => createAccountSparkNotFoundError({ id })

export const cashRegisterAccountNotFound = (
  id: AccountId
): CashRegisterAccountNotFoundError =>
  createCashRegisterAccountNotFoundError({ id })

export const ibanAccountNotFound = (id: AccountId): IbanAccountNotFoundError =>
  createIbanAccountNotFoundError({ id })

export const accountCurrencyMismatch = ({
  accountKind,
  id,
  accountCurrency,
  paymentCurrency,
}: {
  readonly accountKind: "cashRegister" | "iban"
  readonly id: AccountId
  readonly accountCurrency: FiatCurrency
  readonly paymentCurrency: FiatCurrency
}): AccountCurrencyMismatchError =>
  createAccountCurrencyMismatchError({
    accountKind,
    id,
    accountCurrency,
    paymentCurrency,
  })

const paymentPreparationFailed = (
  message: string
): PaymentPreparationFailedError =>
  createPaymentPreparationFailedError({ message })

const paymentNumberNotFound = (
  paymentId: PaymentId
): PaymentNumberNotFoundError => createPaymentNumberNotFoundError({ paymentId })

/**
 * Shared "load the first row or fail, then check its currency matches" step
 * behind both `preparePaymentMethod`'s cash-register/IBAN branches and
 * `markPaymentPaidCash`.
 */
const loadAccountWithCurrencyCheck = <
  TRow extends { readonly currency: FiatCurrency },
  TNotFoundError,
>(
  rows: ReadonlyArray<TRow>,
  notFoundError: TNotFoundError,
  accountKind: "cashRegister" | "iban",
  accountId: AccountId,
  expectedCurrency: FiatCurrency
): Result<TRow, TNotFoundError | AccountCurrencyMismatchError> => {
  const accountResult = getFirstOr(rows, notFoundError)
  if (!accountResult.ok) return accountResult

  const account = accountResult.value
  if (account.currency !== expectedCurrency) {
    return err(
      accountCurrencyMismatch({
        accountKind,
        id: accountId,
        accountCurrency: account.currency,
        paymentCurrency: expectedCurrency,
      })
    )
  }

  return ok(account)
}

const convertFiatMinorUnitsToSats = (
  amount: number,
  exchangeRate: number
): number => {
  if (amount === 0) return 0

  const fiatAmount = amount / FIAT_MINOR_UNITS
  return Math.max(1, Math.round((fiatAmount / exchangeRate) * SATS_PER_BTC))
}

const createVariableSymbolFromSerialNumber = (
  serialNumber: number
): VariableSymbol => VariableSymbol(String(serialNumber))

const createSpecificSymbolFromDate = (date: DateString): SpecificSymbol =>
  SpecificSymbol(`${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`)

const optionalNonEmptyString = (
  value: string | null | undefined
): NonEmptyString | undefined =>
  value === null || value === undefined || value === ""
    ? undefined
    : NonEmptyStringSchema.decode(value)

const optionalNonEmptySparkInvoice = (
  sparkInvoice: string | null | undefined
): { readonly sparkInvoice: NonEmptyString } | undefined => {
  const parsedSparkInvoice = optionalNonEmptyString(sparkInvoice)

  return parsedSparkInvoice === undefined
    ? undefined
    : {
        sparkInvoice: parsedSparkInvoice,
      }
}

type PaymentBtcInput = WithSparkDetails<
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
 * Quotes the fiat amount in sats, creates a Spark Lightning invoice, and
 * shapes the result into the `paymentBtc`/`paymentBtcLightning`/
 * `paymentBtcSpark` payload shared by `createPreparedPayment` and
 * `preparePaymentMethod`. Does not write anything.
 */
const createSparkLightningInvoice =
  ({
    accountId,
    secret,
    currency,
    amount,
    memo,
    expirySeconds,
    includeSparkInvoice,
  }: {
    readonly accountId: AccountId
    readonly secret: SparkSecret
    readonly currency: FiatCurrency
    readonly amount: number
    readonly memo?: string
    readonly expirySeconds?: number
    readonly includeSparkInvoice?: boolean
  }): Task<
    PaymentBtcInput,
    PaymentPreparationFailedError | YadioHttpError | YadioApiError | FetchError,
    EvoluDep & SparkWalletDep & FetchDep & YadioApiDep
  > =>
  async (run) => {
    const quote = await run(fetchYadioBtcExchangeRate(currency))
    if (!quote.ok) return quote

    const amountSats = NonNegativeIntegerSchema.decode(
      convertFiatMinorUnitsToSats(amount, quote.value.exchangeRate)
    )

    try {
      await using wallet = await run.deps.sparkWallet.create(secret)
      const lightningInvoice = await wallet.createLightningInvoice(
        removeUndefinedValues({
          amountSats,
          memo,
          expirySeconds,
          includeSparkInvoice: includeSparkInvoice ?? true,
        })
      )

      return ok({
        accountId,
        amountSats,
        exchangeRate: PositiveNumberSchema.decode(quote.value.exchangeRate),
        exchangeRateSource: "yadio" as const,
        exchangeRateFetchedAt: TimestampMsSchema.decode(quote.value.fetchedAt),
        lightning: {
          lnInvoice: NonEmptyStringSchema.decode(
            lightningInvoice.invoice.encodedInvoice
          ),
          ...removeUndefinedValues({
            lightningReceiveRequestId: optionalNonEmptyString(
              lightningInvoice.id
            ),
            paymentHash: optionalNonEmptyString(
              lightningInvoice.invoice.paymentHash
            ),
            paymentPreimage: optionalNonEmptyString(
              lightningInvoice.paymentPreimage
            ),
          }),
        },
        sparkInvoice: optionalNonEmptySparkInvoice(
          lightningInvoice.sparkInvoice
        ),
      })
    } catch (error) {
      return err(
        paymentPreparationFailed(
          error instanceof Error
            ? error.message
            : "Failed to prepare payment details"
        )
      )
    }
  }

export const loadPayment =
  (idValue: PaymentId): Task<PaymentRow, PaymentNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(paymentByIdQuery(idValue)),
      paymentNotFound(idValue)
    )

export type CreatePaymentError = BillNotFoundError | BillNotOpenError

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
    const billId = input.billId ?? null
    if (billId !== null) {
      const openResult = await run(requireBillAcceptingPayment(billId))
      if (!openResult.ok) return openResult
    }

    // Frozen for `snapshotBillLinesForPayment` below — captured from this
    // device's own local view, before the mutation batch, since it can't be
    // reliably reconstructed later from `billLine.createdAt` (see that
    // function's doc comment).
    const billLineSnapshot =
      billId !== null
        ? await run.ok(loadCalculatedBillLineSummaries(billId))
        : null

    const id = createTableId<"Payment">()
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
        run.deps.evolu.upsert(
          "paymentBtc",
          removeUndefinedValues({
            accountId: spark.accountId,
            amountSats: spark.amountSats,
            exchangeRate: spark.exchangeRate,
            exchangeRateSource: spark.exchangeRateSource,
            exchangeRateFetchedAt: spark.exchangeRateFetchedAt,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
        if (spark.lightning) {
          run.deps.evolu.upsert(
            "paymentBtcLightning",
            removeUndefinedValues({
              ...spark.lightning,
              id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
        if (spark.sparkInvoice) {
          run.deps.evolu.upsert(
            "paymentBtcSpark",
            removeUndefinedValues({
              ...spark.sparkInvoice,
              id,
            }),
            { ...options, ownerId: evoluOwnerId }
          )
        }
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

export const createPreparedPayment =
  ({
    spark,
    ...input
  }: Omit<InsertValues<typeof payment>, "expiresAt"> & {
    readonly cashRegister?: Omit<InsertValues<typeof paymentCashRegister>, "id">
    readonly spark?: Omit<
      InsertValues<typeof paymentBtc>,
      | "id"
      | "amountSats"
      | "exchangeRate"
      | "exchangeRateSource"
      | "exchangeRateFetchedAt"
    > & {
      readonly memo?: string
      readonly expirySeconds?: number
      readonly includeSparkInvoice?: boolean
    }
    readonly iban?: Omit<InsertValues<typeof paymentIban>, "id">
  }): Task<
    PaymentId,
    CreatePreparedPaymentError,
    EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      SparkWalletDep &
      FetchDep &
      YadioApiDep
  > =>
  async (run) => {
    if (!spark) {
      return run(createPayment({ ...input, expiresAt: null }))
    }

    const sparkAccounts = await run.deps.evolu.loadQuery(
      activeSparkAccountsQuery
    )
    const sparkAccount = sparkAccounts.find(
      (account) => account.id === spark.accountId
    )
    if (!sparkAccount) {
      return err(accountSparkNotFound(spark.accountId))
    }

    const sparkPaymentResult = await run(
      createSparkLightningInvoice({
        accountId: spark.accountId,
        secret: sparkAccount.secret,
        currency: input.currency,
        amount: input.amount,
        memo: spark.memo,
        expirySeconds: spark.expirySeconds,
        includeSparkInvoice: spark.includeSparkInvoice,
      })
    )
    if (!sparkPaymentResult.ok) return sparkPaymentResult

    return run(
      createPayment({
        ...input,
        expiresAt: computePaymentExpiresAt(
          run.deps.date.now(),
          spark.expirySeconds
        ),
        spark: sparkPaymentResult.value,
      })
    )
  }

export const preparePaymentMethod =
  ({
    paymentId,
    bank,
    cashRegister,
    spark,
  }: {
    readonly paymentId: PaymentId
    readonly bank?: {
      readonly accountId: AccountId
    }
    readonly cashRegister?: {
      readonly accountId: AccountId
    }
    readonly spark?: {
      readonly accountId: AccountId
      readonly memo?: string
      readonly expirySeconds?: number
      readonly includeSparkInvoice?: boolean
    }
  }): Task<
    PaymentId,
    PreparePaymentMethodError,
    EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      SparkWalletDep &
      FetchDep &
      YadioApiDep
  > =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult

    const payment = paymentResult.value

    const [cashRegisterPayment, bankPayment] = await Promise.all([
      cashRegister === undefined
        ? Promise.resolve(null)
        : (async () => {
            const accountResult = loadAccountWithCurrencyCheck(
              await run.deps.evolu.loadQuery(
                cashRegisterAccountByIdQuery(cashRegister.accountId)
              ),
              cashRegisterAccountNotFound(cashRegister.accountId),
              "cashRegister",
              cashRegister.accountId,
              payment.currency
            )
            if (!accountResult.ok) return accountResult

            return ok({
              id: paymentId,
              accountId: cashRegister.accountId,
            })
          })(),
      bank === undefined
        ? Promise.resolve(null)
        : (async () => {
            const accountResult = loadAccountWithCurrencyCheck(
              await run.deps.evolu.loadQuery(
                ibanAccountByIdQuery(bank.accountId)
              ),
              ibanAccountNotFound(bank.accountId),
              "iban",
              bank.accountId,
              payment.currency
            )
            if (!accountResult.ok) return accountResult

            const paymentNumberResult = getFirstOr(
              await run.deps.evolu.loadQuery(
                paymentNumberByPaymentIdQuery(paymentId)
              ),
              paymentNumberNotFound(paymentId)
            )
            if (!paymentNumberResult.ok) return paymentNumberResult

            const paymentNumber = paymentNumberResult.value
            const variableSymbol = createVariableSymbolFromSerialNumber(
              paymentNumber.serialNumber
            )
            const specificSymbol = createSpecificSymbolFromDate(
              paymentNumber.date
            )

            const paymentIbanValue = removeUndefinedValues({
              id: paymentId,
              accountId: bank.accountId,
              variableSymbol,
              specificSymbol,
            })

            return ok(paymentIbanValue)
          })(),
    ])
    if (cashRegisterPayment !== null && !cashRegisterPayment.ok) {
      return cashRegisterPayment
    }
    if (bankPayment !== null && !bankPayment.ok) {
      return bankPayment
    }

    const sparkPaymentResult =
      spark === undefined
        ? null
        : await (async () => {
            const sparkAccounts = await run.deps.evolu.loadQuery(
              activeSparkAccountsQuery
            )
            const sparkAccount = sparkAccounts.find(
              (account) => account.id === spark.accountId
            )
            if (!sparkAccount) return err(accountSparkNotFound(spark.accountId))

            const sparkInvoiceResult = await run(
              createSparkLightningInvoice({
                accountId: spark.accountId,
                secret: sparkAccount.secret,
                currency: payment.currency,
                amount: payment.amount,
                memo: spark.memo,
                expirySeconds: spark.expirySeconds,
                includeSparkInvoice: spark.includeSparkInvoice,
              })
            )
            if (!sparkInvoiceResult.ok) return sparkInvoiceResult

            return ok({ id: paymentId, ...sparkInvoiceResult.value })
          })()
    if (sparkPaymentResult !== null && !sparkPaymentResult.ok) {
      return sparkPaymentResult
    }

    if (
      cashRegisterPayment === null &&
      bankPayment === null &&
      sparkPaymentResult === null
    ) {
      return ok(paymentId)
    }

    // `payment.expiresAt` describes the payment as a whole, but only some
    // methods expire: a Lightning invoice does, a cash drawer or a bank
    // transfer never does. The methods can coexist on one payment, so the
    // payment expires only while *every* prepared method has an expiry
    // window. Without this, preparing Lightning and then switching the same
    // payment to cash or IBAN left the old `expiresAt` behind, and 15
    // minutes later `derivePaymentStatus` reported a perfectly live cash
    // payment as `expired` — silently releasing the bill's editing lock.
    // See docs/bill-payment-states.md.
    const nonExpiringMethods = await run.deps.evolu.loadQuery(
      paymentNonExpiringMethodsByIdQuery(paymentId)
    )
    const hasNonExpiringMethod =
      cashRegisterPayment?.ok === true ||
      bankPayment?.ok === true ||
      nonExpiringMethods.some(
        (row) =>
          row.cashRegisterAccountId !== null || row.ibanAccountId !== null
      )

    await runMutationWithCompletion((options) => {
      if (cashRegisterPayment?.ok) {
        run.deps.evolu.upsert(
          "paymentCashRegister",
          cashRegisterPayment.value,
          {
            ...options,
            ownerId: evoluOwnerId,
          }
        )
      }

      if (bankPayment?.ok) {
        run.deps.evolu.upsert("paymentIban", bankPayment.value, {
          ...options,
          ownerId: evoluOwnerId,
        })
      }

      if (sparkPaymentResult?.ok) {
        run.deps.evolu.upsert(
          "paymentBtc",
          removeUndefinedValues({
            id: sparkPaymentResult.value.id,
            accountId: sparkPaymentResult.value.accountId,
            amountSats: sparkPaymentResult.value.amountSats,
            exchangeRate: sparkPaymentResult.value.exchangeRate,
            exchangeRateSource: sparkPaymentResult.value.exchangeRateSource,
            exchangeRateFetchedAt:
              sparkPaymentResult.value.exchangeRateFetchedAt,
          }),
          {
            ...options,
            ownerId: evoluOwnerId,
          }
        )
        if (sparkPaymentResult.value.lightning) {
          run.deps.evolu.upsert(
            "paymentBtcLightning",
            removeUndefinedValues({
              ...sparkPaymentResult.value.lightning,
              id: sparkPaymentResult.value.id,
            }),
            {
              ...options,
              ownerId: evoluOwnerId,
            }
          )
        }
        if (sparkPaymentResult.value.sparkInvoice) {
          run.deps.evolu.upsert(
            "paymentBtcSpark",
            removeUndefinedValues({
              ...sparkPaymentResult.value.sparkInvoice,
              id: sparkPaymentResult.value.id,
            }),
            {
              ...options,
              ownerId: evoluOwnerId,
            }
          )
        }
        if (spark?.expirySeconds !== undefined && !hasNonExpiringMethod) {
          run.deps.evolu.update(
            "payment",
            {
              id: paymentId,
              expiresAt: computePaymentExpiresAt(
                run.deps.date.now(),
                spark.expirySeconds
              ),
            },
            { ...options, ownerId: evoluOwnerId }
          )
        }
      }

      if (hasNonExpiringMethod && payment.expiresAt !== null) {
        run.deps.evolu.update(
          "payment",
          { id: paymentId, expiresAt: null },
          { ...options, ownerId: evoluOwnerId }
        )
      }
    })

    return ok(paymentId)
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

export const markPaymentPaidCash =
  ({
    paymentId,
    accountId,
    deviceId,
    occurredAt,
    note,
  }: {
    readonly paymentId: PaymentId
    readonly accountId: AccountId
    readonly deviceId?: DeviceId | null
    readonly occurredAt?: TimestampMs
    readonly note?: NonEmptyString | null
  }): Task<
    PaymentId,
    MarkPaymentPaidCashError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult

    const payment = paymentResult.value
    const cashRegisterAccountResult = loadAccountWithCurrencyCheck(
      await run.deps.evolu.loadQuery(cashRegisterAccountByIdQuery(accountId)),
      cashRegisterAccountNotFound(accountId),
      "cashRegister",
      accountId,
      payment.currency
    )
    if (!cashRegisterAccountResult.ok) return cashRegisterAccountResult

    const accountTransactionResult = await run(
      createAccountTransaction({
        id: createIdFromString<"AccountTransaction">(
          `accountTransaction:cashRegister:payment:${paymentId}:${accountId}`
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
      })
    )
    if (!accountTransactionResult.ok) return accountTransactionResult

    return await run(
      claimManualReconciliation({
        paymentId,
        accountTransactionId: accountTransactionResult.value,
        deviceId: deviceId ?? null,
      })
    )
  }

/**
 * Manual counterpart to the Fio-plugin auto-settlement: staff confirming
 * they've checked their bank and the transfer for this payment arrived,
 * since the auto-detection sync job only runs in the native app. Mirrors
 * `markPaymentPaidCash` exactly, against the IBAN account instead.
 */
export const markPaymentPaidIban =
  ({
    paymentId,
    accountId,
    deviceId,
    occurredAt,
    note,
  }: {
    readonly paymentId: PaymentId
    readonly accountId: AccountId
    readonly deviceId?: DeviceId | null
    readonly occurredAt?: TimestampMs
    readonly note?: NonEmptyString | null
  }): Task<
    PaymentId,
    MarkPaymentPaidIbanError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult

    const payment = paymentResult.value
    const ibanAccountResult = loadAccountWithCurrencyCheck(
      await run.deps.evolu.loadQuery(ibanAccountByIdQuery(accountId)),
      ibanAccountNotFound(accountId),
      "iban",
      accountId,
      payment.currency
    )
    if (!ibanAccountResult.ok) return ibanAccountResult

    const accountTransactionResult = await run(
      createAccountTransaction({
        id: createIdFromString<"AccountTransaction">(
          `accountTransaction:iban:manual:payment:${paymentId}:${accountId}`
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
      })
    )
    if (!accountTransactionResult.ok) return accountTransactionResult

    return await run(
      claimManualReconciliation({
        paymentId,
        accountTransactionId: accountTransactionResult.value,
        deviceId: deviceId ?? null,
      })
    )
  }

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
      return err(paymentAlreadyPaid(paymentId))
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
      return err(paymentNotCanceled(paymentId))
    }

    const activeClaims = await run.deps.evolu.loadQuery(
      activeReconciliationClaimsByPaymentIdQuery(paymentId)
    )
    if (activeClaims.length === 0) {
      return err(paymentNotClaimed(paymentId))
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
    const claimedSum = calculatePaymentClaimedSum(claimedTransactions)
    if (claimedSum <= paymentResult.value.amount) {
      return err(paymentNotOverpaid(paymentId))
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
