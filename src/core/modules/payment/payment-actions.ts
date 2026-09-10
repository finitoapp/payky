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
  type UpsertValues,
} from "@evolu/common"
import type {
  DateDep,
  EvoluOwnerIdDep,
  FetchDep,
  FetchError,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { EvoluSchema } from "@/core/evolu/schema.ts"
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
import { activeSparkAccountByIdQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type {
  BillNotFoundError,
  BillNotOpenError,
} from "@/core/modules/bill/bill-actions.ts"
import { requireBillAcceptingPayment } from "@/core/modules/bill/bill-actions.ts"
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
import {
  calculatePaymentClaimedSum,
  computePaymentExpiresAt,
  DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS,
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

export const paymentNotFound = defineError("PaymentNotFound")<{
  readonly id: PaymentId
}>()
export type PaymentNotFoundError = ReturnType<typeof paymentNotFound>

export const paymentAlreadyPaid = defineError("PaymentAlreadyPaid")<{
  readonly id: PaymentId
}>()
export type PaymentAlreadyPaidError = ReturnType<typeof paymentAlreadyPaid>

export const paymentNotCanceled = defineError("PaymentNotCanceled")<{
  readonly id: PaymentId
}>()
export type PaymentNotCanceledError = ReturnType<typeof paymentNotCanceled>

export const paymentNotClaimed = defineError("PaymentNotClaimed")<{
  readonly id: PaymentId
}>()
export type PaymentNotClaimedError = ReturnType<typeof paymentNotClaimed>

export const paymentNotOverpaid = defineError("PaymentNotOverpaid")<{
  readonly id: PaymentId
}>()
export type PaymentNotOverpaidError = ReturnType<typeof paymentNotOverpaid>

export const accountSparkNotFound = defineError("AccountSparkNotFound")<{
  readonly id: AccountId
}>()
export type AccountSparkNotFoundError = ReturnType<typeof accountSparkNotFound>

const paymentPreparationFailed = defineError("PaymentPreparationFailed")<{
  readonly message: string
}>()
export type PaymentPreparationFailedError = ReturnType<
  typeof paymentPreparationFailed
>

const zeroAmountNotPayable = defineError("ZeroAmountNotPayable")<{
  readonly amount: number
}>()
export type ZeroAmountNotPayableError = ReturnType<typeof zeroAmountNotPayable>

const paymentNumberNotFound = defineError("PaymentNumberNotFound")<{
  readonly paymentId: PaymentId
}>()
export type PaymentNumberNotFoundError = ReturnType<
  typeof paymentNumberNotFound
>

export const cashRegisterAccountNotFound = defineError(
  "CashRegisterAccountNotFound"
)<{
  readonly id: AccountId
}>()
export type CashRegisterAccountNotFoundError = ReturnType<
  typeof cashRegisterAccountNotFound
>

export const ibanAccountNotFound = defineError("IbanAccountNotFound")<{
  readonly id: AccountId
}>()
export type IbanAccountNotFoundError = ReturnType<typeof ibanAccountNotFound>

export const accountCurrencyMismatch = defineError("AccountCurrencyMismatch")<{
  readonly accountKind: "cashRegister" | "iban"
  readonly id: AccountId
  readonly accountCurrency: FiatCurrency
  readonly paymentCurrency: FiatCurrency
}>()
export type AccountCurrencyMismatchError = ReturnType<
  typeof accountCurrencyMismatch
>

export type CreatePreparedPaymentError =
  | AccountSparkNotFoundError
  | ZeroAmountNotPayableError
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
  | ZeroAmountNotPayableError
  | CashRegisterAccountNotFoundError
  | AccountCurrencyMismatchError
  | AccountSparkNotFoundError
  | IbanAccountNotFoundError
  | PaymentNumberNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError
  | YadioApiError
  | FetchError

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

/**
 * A positive `amount` is the caller's precondition — see
 * `createSparkLightningInvoice`, which refuses zero before reaching here. One
 * minor unit is worth a fraction of a sat at any realistic rate, so the floor
 * of one sat is what keeps the smallest chargeable amount from rounding down
 * to an amountless invoice.
 */
const convertFiatMinorUnitsToSats = (
  amount: number,
  exchangeRate: number
): number => {
  const fiatAmount = amount / FIAT_MINOR_UNITS
  return Math.max(1, Math.round((fiatAmount / exchangeRate) * SATS_PER_BTC))
}

/**
 * The two symbols a payer quotes on a bank transfer, derived from the
 * payment's own number: the variable symbol is its serial, the specific symbol
 * its date as `YYMMDD`.
 *
 * One call site each, and named anyway — these are the format
 * `ibanReconciliationCandidateByAccountTransactionIdQuery` matches an incoming
 * transaction against, so they are a contract with the bank rather than
 * expression noise. Inline, the second is three `slice` calls that read as
 * nothing in particular.
 */
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
    /**
     * Required, not optional: the SDK applies a default of its own when this
     * is omitted, and the invoice then expires at a time nothing in this app
     * knows — leaving `payment.expiresAt` either null or stale, so
     * `derivePaymentStatus` never learns the invoice died and the bill's
     * editing lock never releases. Callers resolve
     * `DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS` so the stored expiry and the
     * invoice's own always come from the same number.
     */
    readonly expirySeconds: number
    readonly includeSparkInvoice?: boolean
  }): Task<
    PaymentBtcInput,
    | ZeroAmountNotPayableError
    | PaymentPreparationFailedError
    | YadioHttpError
    | YadioApiError
    | FetchError,
    EvoluDep & SparkWalletDep & FetchDep & YadioApiDep
  > =>
  async (run) => {
    // A zero-sat Lightning invoice is an *amountless* invoice: the payer
    // chooses what to send. Handing one out from a terminal displaying a zero
    // charge would take whatever arrived and claim it against a payment worth
    // nothing, so refuse before the quote is even fetched. The keypad does
    // let "0" through — it only checks that the amount parses — which is how
    // this is reachable at all.
    if (amount <= 0) return err(zeroAmountNotPayable({ amount }))

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
      // A `paymentBtcSpark` row only exists when the SDK actually returned an
      // invoice — `includeSparkInvoice` is a request, not a guarantee.
      const sparkInvoice = optionalNonEmptyString(lightningInvoice.sparkInvoice)

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
        sparkInvoice: sparkInvoice === undefined ? undefined : { sparkInvoice },
      })
    } catch (error) {
      return err(
        paymentPreparationFailed({
          message:
            error instanceof Error
              ? error.message
              : "Failed to prepare payment details",
        })
      )
    }
  }

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
const upsertPaymentSparkDetails = (
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
      paymentNotFound({ id: idValue })
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

    const [sparkAccount] = await run.deps.evolu.loadQuery(
      activeSparkAccountByIdQuery(spark.accountId)
    )
    if (!sparkAccount) {
      return err(accountSparkNotFound({ id: spark.accountId }))
    }

    const expirySeconds =
      spark.expirySeconds ?? DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS
    const sparkPaymentResult = await run(
      createSparkLightningInvoice({
        accountId: spark.accountId,
        secret: sparkAccount.secret,
        currency: input.currency,
        amount: input.amount,
        memo: spark.memo,
        expirySeconds,
        includeSparkInvoice: spark.includeSparkInvoice,
      })
    )
    if (!sparkPaymentResult.ok) return sparkPaymentResult

    return run(
      createPayment({
        ...input,
        expiresAt: computePaymentExpiresAt(run.deps.date.now(), expirySeconds),
        spark: sparkPaymentResult.value,
      })
    )
  }

/**
 * Resolves one requested payment method into the row it should write, or the
 * reason it cannot. Each is its own Task so `preparePaymentMethod` composes
 * them with the ordinary `await run(...)` shape instead of inline async IIFEs
 * whose `Result`s it then has to unwrap by hand.
 */
const prepareCashRegisterMethod =
  ({
    paymentId,
    accountId,
    paymentCurrency,
  }: {
    readonly paymentId: PaymentId
    readonly accountId: AccountId
    readonly paymentCurrency: FiatCurrency
  }): Task<
    UpsertValues<typeof paymentCashRegister>,
    CashRegisterAccountNotFoundError | AccountCurrencyMismatchError,
    EvoluDep
  > =>
  async (run) => {
    const accountResult = loadAccountWithCurrencyCheck(
      await run.deps.evolu.loadQuery(cashRegisterAccountByIdQuery(accountId)),
      cashRegisterAccountNotFound({ id: accountId }),
      "cashRegister",
      accountId,
      paymentCurrency
    )
    if (!accountResult.ok) return accountResult

    return ok({ id: paymentId, accountId })
  }

/**
 * Unlike the other methods, a bank transfer needs the payment's number: its
 * serial and date become the variable and specific symbols the payer quotes.
 */
const prepareIbanMethod =
  ({
    paymentId,
    accountId,
    paymentCurrency,
  }: {
    readonly paymentId: PaymentId
    readonly accountId: AccountId
    readonly paymentCurrency: FiatCurrency
  }): Task<
    UpsertValues<typeof paymentIban>,
    | IbanAccountNotFoundError
    | AccountCurrencyMismatchError
    | PaymentNumberNotFoundError,
    EvoluDep
  > =>
  async (run) => {
    const accountResult = loadAccountWithCurrencyCheck(
      await run.deps.evolu.loadQuery(ibanAccountByIdQuery(accountId)),
      ibanAccountNotFound({ id: accountId }),
      "iban",
      accountId,
      paymentCurrency
    )
    if (!accountResult.ok) return accountResult

    const paymentNumberResult = getFirstOr(
      await run.deps.evolu.loadQuery(paymentNumberByPaymentIdQuery(paymentId)),
      paymentNumberNotFound({ paymentId })
    )
    if (!paymentNumberResult.ok) return paymentNumberResult

    const paymentNumber = paymentNumberResult.value

    return ok(
      removeUndefinedValues({
        id: paymentId,
        accountId,
        variableSymbol: createVariableSymbolFromSerialNumber(
          paymentNumber.serialNumber
        ),
        specificSymbol: createSpecificSymbolFromDate(paymentNumber.date),
      })
    )
  }

const prepareSparkMethod =
  ({
    paymentId,
    paymentCurrency,
    amount,
    spark,
  }: {
    readonly paymentId: PaymentId
    readonly paymentCurrency: FiatCurrency
    readonly amount: number
    readonly spark: {
      readonly accountId: AccountId
      readonly memo?: string
      readonly expirySeconds?: number
      readonly includeSparkInvoice?: boolean
    }
  }): Task<
    {
      readonly id: PaymentId
      readonly expirySeconds: number
    } & PaymentBtcInput,
    | AccountSparkNotFoundError
    | ZeroAmountNotPayableError
    | PaymentPreparationFailedError
    | YadioHttpError
    | YadioApiError
    | FetchError,
    EvoluDep & SparkWalletDep & FetchDep & YadioApiDep
  > =>
  async (run) => {
    const [sparkAccount] = await run.deps.evolu.loadQuery(
      activeSparkAccountByIdQuery(spark.accountId)
    )
    if (!sparkAccount) return err(accountSparkNotFound({ id: spark.accountId }))

    const expirySeconds =
      spark.expirySeconds ?? DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS
    const sparkInvoiceResult = await run(
      createSparkLightningInvoice({
        accountId: spark.accountId,
        secret: sparkAccount.secret,
        currency: paymentCurrency,
        amount,
        memo: spark.memo,
        expirySeconds,
        includeSparkInvoice: spark.includeSparkInvoice,
      })
    )
    if (!sparkInvoiceResult.ok) return sparkInvoiceResult

    // Returned so the caller stores the window this invoice was actually
    // made with, rather than whatever it happened to pass in.
    return ok({ id: paymentId, expirySeconds, ...sparkInvoiceResult.value })
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
    // Both reads need nothing but `paymentId`, so they go together — see
    // `hasNonExpiringMethod` below for what the second one answers. Reading
    // the stored methods here rather than just before the write is safe
    // because the three `prepare*Method`s only read: every write in this
    // action happens in the one mutation batch at the end.
    const [paymentResult, nonExpiringMethods] = await Promise.all([
      run(loadPayment(paymentId)),
      run.deps.evolu.loadQuery(paymentNonExpiringMethodsByIdQuery(paymentId)),
    ])
    if (!paymentResult.ok) return paymentResult

    const payment = paymentResult.value

    // `null` means the method wasn't requested, which is not the same as
    // failing to prepare it — hence one nullable `Result` each, collapsed to
    // plain nullable values below. The cash and bank preparations are
    // independent reads, so they run together.
    const [cashRegisterResult, ibanResult] = await Promise.all([
      cashRegister === undefined
        ? null
        : run(
            prepareCashRegisterMethod({
              paymentId,
              accountId: cashRegister.accountId,
              paymentCurrency: payment.currency,
            })
          ),
      bank === undefined
        ? null
        : run(
            prepareIbanMethod({
              paymentId,
              accountId: bank.accountId,
              paymentCurrency: payment.currency,
            })
          ),
    ])
    if (cashRegisterResult !== null && !cashRegisterResult.ok) {
      return cashRegisterResult
    }
    if (ibanResult !== null && !ibanResult.ok) return ibanResult

    // Spark waits its turn: it calls out to Yadio and the Spark SDK, so
    // there is no point starting that before the cheap account checks pass.
    const sparkResult =
      spark === undefined
        ? null
        : await run(
            prepareSparkMethod({
              paymentId,
              paymentCurrency: payment.currency,
              amount: payment.amount,
              spark,
            })
          )
    if (sparkResult !== null && !sparkResult.ok) return sparkResult

    const cashRegisterValues = cashRegisterResult?.value ?? null
    const ibanValues = ibanResult?.value ?? null
    const sparkValues = sparkResult?.value ?? null

    if (
      cashRegisterValues === null &&
      ibanValues === null &&
      sparkValues === null
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
    const hasNonExpiringMethod =
      cashRegisterValues !== null ||
      ibanValues !== null ||
      nonExpiringMethods.some(
        (row) =>
          row.cashRegisterAccountId !== null || row.ibanAccountId !== null
      )

    await runMutationWithCompletion((options) => {
      if (cashRegisterValues !== null) {
        run.deps.evolu.upsert("paymentCashRegister", cashRegisterValues, {
          ...options,
          ownerId: evoluOwnerId,
        })
      }

      if (ibanValues !== null) {
        run.deps.evolu.upsert("paymentIban", ibanValues, {
          ...options,
          ownerId: evoluOwnerId,
        })
      }

      if (sparkValues !== null) {
        upsertPaymentSparkDetails(run.deps.evolu, sparkValues.id, sparkValues, {
          ...options,
          ownerId: evoluOwnerId,
        })
        // Unconditional for a Spark preparation: a new invoice always has a
        // new expiry, so keeping the previous `expiresAt` would report a live
        // payment as expired. It used to be skipped whenever the caller
        // omitted `expirySeconds`, which is exactly when the old stamp was
        // most likely to be wrong.
        if (!hasNonExpiringMethod) {
          run.deps.evolu.update(
            "payment",
            {
              id: paymentId,
              expiresAt: computePaymentExpiresAt(
                run.deps.date.now(),
                sparkValues.expirySeconds
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
    const accountResult = loadAccountWithCurrencyCheck(
      await run.deps.evolu.loadQuery(accountQuery(accountId)),
      notFoundError,
      accountKind,
      accountId,
      payment.currency
    )
    if (!accountResult.ok) return accountResult

    const accountTransactionId = await run.ok(
      createAccountTransaction({
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
      })
    )

    return await run(
      claimManualReconciliation({
        paymentId,
        accountTransactionId,
        deviceId: deviceId ?? null,
      })
    )
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
    notFoundError: cashRegisterAccountNotFound({ id: input.accountId }),
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
    notFoundError: ibanAccountNotFound({ id: input.accountId }),
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
      return err(paymentAlreadyPaid({ id: paymentId }))
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
      return err(paymentNotCanceled({ id: paymentId }))
    }

    const activeClaims = await run.deps.evolu.loadQuery(
      activeReconciliationClaimsByPaymentIdQuery(paymentId)
    )
    if (activeClaims.length === 0) {
      return err(paymentNotClaimed({ id: paymentId }))
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
      return err(paymentNotOverpaid({ id: paymentId }))
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
