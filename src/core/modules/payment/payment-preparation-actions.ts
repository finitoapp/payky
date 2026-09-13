import {
  err,
  type InsertValues,
  ok,
  type Task,
  type UpsertValues,
} from "@evolu/common"
import type {
  DateDep,
  EvoluOwnerIdDep,
  FetchDep,
  FetchError,
} from "@/core/deps.ts"
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
import type {
  payment,
  paymentBtc,
  paymentCashRegister,
  paymentIban,
} from "@/core/modules/payment/payment.ts"
import {
  computePaymentExpiresAt,
  DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS,
} from "@/core/modules/payment/payment-status-utils.ts"
import { paymentNumberByPaymentIdQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import type { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import type { SparkWalletDep } from "@/core/spark/spark-wallet.ts"
import { fiatMinorUnitsToSats } from "../shared/money.ts"
import {
  type FiatCurrency,
  type NonEmptyString,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
  TimestampMsSchema,
} from "../shared/schema.ts"
import {
  createPayment,
  loadAccountWithCurrencyCheck,
  loadPayment,
  type PaymentBtcInput,
  upsertPaymentSparkDetails,
} from "./payment-actions.ts"
import {
  type AccountCurrencyMismatchError,
  type AccountSparkNotFoundError,
  accountSparkNotFound,
  type CashRegisterAccountNotFoundError,
  type CreatePreparedPaymentError,
  cashRegisterAccountNotFound,
  type IbanAccountNotFoundError,
  ibanAccountNotFound,
  type PaymentNumberNotFoundError,
  type PaymentPreparationFailedError,
  type PreparePaymentMethodError,
  paymentNumberNotFound,
  paymentPreparationFailed,
  type ZeroAmountNotPayableError,
  zeroAmountNotPayable,
} from "./payment-errors.ts"
import { paymentNonExpiringMethodsByIdQuery } from "./payment-queries.ts"
import {
  createSpecificSymbolFromDate,
  createVariableSymbolFromSerialNumber,
} from "./payment-symbol-utils.ts"
import type { PaymentId } from "./payment-types.ts"

const optionalNonEmptyString = (
  value: string | null | undefined
): NonEmptyString | undefined =>
  value === null || value === undefined || value === ""
    ? undefined
    : NonEmptyStringSchema.decode(value)

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
      fiatMinorUnitsToSats({
        amount,
        currency,
        exchangeRate: quote.value.exchangeRate,
      })
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
    const accountResult = loadAccountWithCurrencyCheck({
      rows: await run.deps.evolu.loadQuery(
        cashRegisterAccountByIdQuery(accountId)
      ),
      notFoundError: cashRegisterAccountNotFound({ id: accountId }),
      accountKind: "cashRegister",
      accountId,
      expectedCurrency: paymentCurrency,
    })
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
    const accountResult = loadAccountWithCurrencyCheck({
      rows: await run.deps.evolu.loadQuery(ibanAccountByIdQuery(accountId)),
      notFoundError: ibanAccountNotFound({ id: accountId }),
      accountKind: "iban",
      accountId,
      expectedCurrency: paymentCurrency,
    })
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
