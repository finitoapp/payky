import {
  createIdFromString,
  err,
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type { EvoluOwnerIdDep, FetchDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  fetchYadioBtcExchangeRate,
  type YadioHttpError,
} from "@/core/integrations/yadio/yadio-client.ts"
import { cashRegisterAccountByIdQuery } from "@/core/modules/account/account-queries.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import type {
  PaymentRow,
  payment,
  paymentCashRegister,
  paymentIban,
  paymentSpark,
} from "@/core/modules/payment/payment.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type {
  SparkPaymentWallet,
  SparkWalletDep,
} from "@/core/spark/spark-wallet.ts"
import {
  type NonEmptyString,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
  type TimestampMs,
  TimestampMsSchema,
} from "../shared/schema.ts"
import { paymentByIdQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

const SATS_PER_BTC = 100_000_000
const FIAT_MINOR_UNITS = 100

const createPaymentNotFoundError = defineError("PaymentNotFound")<{
  readonly id: PaymentId
}>()
export type PaymentNotFoundError = ReturnType<typeof createPaymentNotFoundError>

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

const createCashRegisterAccountNotFoundError = defineError(
  "CashRegisterAccountNotFound"
)<{
  readonly id: AccountId
}>()
export type CashRegisterAccountNotFoundError = ReturnType<
  typeof createCashRegisterAccountNotFoundError
>

const createCashRegisterAccountCurrencyMismatchError = defineError(
  "CashRegisterAccountCurrencyMismatch"
)<{
  readonly id: AccountId
  readonly accountCurrency: string
  readonly paymentCurrency: string
}>()
export type CashRegisterAccountCurrencyMismatchError = ReturnType<
  typeof createCashRegisterAccountCurrencyMismatchError
>

export type CreatePreparedPaymentError =
  | AccountSparkNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError

export type MarkPaymentPaidCashError =
  | PaymentNotFoundError
  | CashRegisterAccountNotFoundError
  | CashRegisterAccountCurrencyMismatchError

export const paymentNotFound = (id: PaymentId): PaymentNotFoundError =>
  createPaymentNotFoundError({ id })

export const accountSparkNotFound = (
  id: AccountId
): AccountSparkNotFoundError => createAccountSparkNotFoundError({ id })

export const cashRegisterAccountNotFound = (
  id: AccountId
): CashRegisterAccountNotFoundError =>
  createCashRegisterAccountNotFoundError({ id })

export const cashRegisterAccountCurrencyMismatch = ({
  id,
  accountCurrency,
  paymentCurrency,
}: {
  readonly id: AccountId
  readonly accountCurrency: string
  readonly paymentCurrency: string
}): CashRegisterAccountCurrencyMismatchError =>
  createCashRegisterAccountCurrencyMismatchError({
    id,
    accountCurrency,
    paymentCurrency,
  })

const paymentPreparationFailed = (
  message: string
): PaymentPreparationFailedError =>
  createPaymentPreparationFailedError({ message })

const convertFiatMinorUnitsToSats = (
  amount: number,
  exchangeRate: number
): number => {
  if (amount === 0) return 0

  const fiatAmount = amount / FIAT_MINOR_UNITS
  return Math.max(1, Math.round((fiatAmount / exchangeRate) * SATS_PER_BTC))
}

export const loadPayment =
  (idValue: PaymentId): Task<PaymentRow, PaymentNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(paymentByIdQuery(idValue)),
      paymentNotFound(idValue)
    )

export const createPayment =
  ({
    cashRegister,
    spark,
    iban,
    ...input
  }: InsertValues<typeof payment> & {
    readonly cashRegister?: Omit<InsertValues<typeof paymentCashRegister>, "id">
    readonly spark?: Omit<InsertValues<typeof paymentSpark>, "id">
    readonly iban?: Omit<InsertValues<typeof paymentIban>, "id">
  }): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const id = createTableId<"Payment">()
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
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
          "paymentSpark",
          removeUndefinedValues({
            ...spark,
            id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
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
  }: InsertValues<typeof payment> & {
    readonly cashRegister?: Omit<InsertValues<typeof paymentCashRegister>, "id">
    readonly spark?: Omit<
      InsertValues<typeof paymentSpark>,
      | "id"
      | "amountSats"
      | "exchangeRate"
      | "exchangeRateSource"
      | "exchangeRateFetchedAt"
      | "lnInvoice"
      | "sparkTechnicalData"
    > & {
      readonly memo?: string
      readonly expirySeconds?: number
      readonly includeSparkInvoice?: boolean
    }
    readonly iban?: Omit<InsertValues<typeof paymentIban>, "id">
  }): Task<
    PaymentId,
    CreatePreparedPaymentError,
    EvoluDep & EvoluOwnerIdDep & SparkWalletDep & FetchDep
  > =>
  async (run) => {
    if (!spark) {
      return run(createPayment(input))
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

    let wallet: SparkPaymentWallet | undefined
    try {
      const quote = await run(fetchYadioBtcExchangeRate(input.currency))
      if (!quote.ok) {
        return quote
      }

      const amountSats = NonNegativeIntegerSchema.decode(
        convertFiatMinorUnitsToSats(input.amount, quote.value.exchangeRate)
      )
      wallet = await run.deps.sparkWallet.create(sparkAccount.mnemonic)
      const lightningInvoice = await wallet.createLightningInvoice(
        removeUndefinedValues({
          amountSats,
          memo: spark.memo,
          expirySeconds: spark.expirySeconds,
          includeSparkInvoice: spark.includeSparkInvoice ?? true,
        })
      )

      const paymentResult = await run(
        createPayment({
          ...input,
          spark: {
            accountId: spark.accountId,
            amountSats,
            exchangeRate: PositiveNumberSchema.decode(quote.value.exchangeRate),
            exchangeRateSource: "yadio",
            exchangeRateFetchedAt: TimestampMsSchema.decode(
              quote.value.fetchedAt
            ),
            lnInvoice: NonEmptyStringSchema.decode(
              lightningInvoice.invoice.encodedInvoice
            ),
            sparkTechnicalData: JSON.stringify(
              removeUndefinedValues({
                lightningReceiveRequestId: lightningInvoice.id,
                paymentHash: lightningInvoice.invoice.paymentHash,
                paymentPreimage: lightningInvoice.paymentPreimage,
                sparkInvoice: lightningInvoice.sparkInvoice,
              })
            ),
          },
        })
      )
      if (!paymentResult.ok) return paymentResult

      return ok(paymentResult.value)
    } catch (error) {
      return err(
        paymentPreparationFailed(
          error instanceof Error
            ? error.message
            : "Failed to prepare payment details"
        )
      )
    } finally {
      await wallet?.cleanup?.()
    }
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
    readonly spark?: Omit<UpdateValues<typeof paymentSpark>, "id">
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
          "paymentSpark",
          removeUndefinedValues({
            ...spark,
            id: input.id,
          }),
          { ...options, ownerId: evoluOwnerId }
        )
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
  }): Task<PaymentId, MarkPaymentPaidCashError, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const paymentResult = await run(loadPayment(paymentId))
    if (!paymentResult.ok) return paymentResult

    const payment = paymentResult.value
    const cashRegisterAccountResult = getFirstOr(
      await run.deps.evolu.loadQuery(cashRegisterAccountByIdQuery(accountId)),
      cashRegisterAccountNotFound(accountId)
    )
    if (!cashRegisterAccountResult.ok) return cashRegisterAccountResult

    const cashRegisterAccount = cashRegisterAccountResult.value
    if (cashRegisterAccount.currency !== payment.currency) {
      return err(
        cashRegisterAccountCurrencyMismatch({
          id: accountId,
          accountCurrency: cashRegisterAccount.currency,
          paymentCurrency: payment.currency,
        })
      )
    }

    const accountTransactionResult = await run(
      createAccountTransaction({
        id: createIdFromString<"AccountTransaction">(
          `accountTransaction:cashRegister:payment:${paymentId}:${accountId}`
        ),
        accountId,
        amount: payment.amount,
        currency: payment.currency,
        occurredAt: occurredAt ?? Date.now(),
        note: note ?? null,
        internalTransferGroupId: null,
        source: {
          deviceId: deviceId ?? null,
          source: "manual",
        },
      })
    )
    if (!accountTransactionResult.ok) return accountTransactionResult

    const id = createIdFromString<"ReconciliationClaim">(
      `reconciliationClaim:manual:${paymentId}:${accountTransactionResult.value}`
    )

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "reconciliationClaim",
        removeUndefinedValues({
          id,
          deviceId: deviceId ?? null,
          paymentId,
          accountTransactionId: accountTransactionResult.value,
          source: "manual" as const,
          claimedAt: Date.now(),
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }

export const cancelPayment =
  (paymentId: PaymentId): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          canceledAt: Date.now(),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(paymentId)
  }
