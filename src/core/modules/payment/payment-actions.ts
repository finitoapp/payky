import {
  err,
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type { FetchDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  fetchYadioBtcExchangeRate,
  type YadioHttpError,
} from "@/core/integrations/yadio/yadio-client.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type {
  PaymentRow,
  payment,
  paymentCashRegister,
  paymentIban,
  paymentSpark,
} from "@/core/modules/payment/payment.ts"
import type { ReconciliationClaimSource } from "@/core/modules/reconciliation-claim/reconciliation-claim.ts"
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
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
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

export type CreatePreparedPaymentError =
  | AccountSparkNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError

export const paymentNotFound = (id: PaymentId): PaymentNotFoundError =>
  createPaymentNotFoundError({ id })

export const accountSparkNotFound = (
  id: AccountId
): AccountSparkNotFoundError => createAccountSparkNotFoundError({ id })

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
  }): Task<PaymentId, never, EvoluDep> =>
  async (run) => {
    const id = createTableId<"Payment">()

    await runMutationWithCompletion((options) => {
      if (cashRegister) {
        run.deps.evolu.upsert(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id,
          }),
          options
        )
      }

      if (spark) {
        run.deps.evolu.upsert(
          "paymentSpark",
          removeUndefinedValues({
            ...spark,
            id,
          }),
          options
        )
      }

      if (iban) {
        run.deps.evolu.upsert(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id,
          }),
          options
        )
      }

      return run.deps.evolu.upsert(
        "payment",
        removeUndefinedValues({
          ...input,
          id,
        }),
        options
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
    EvoluDep & SparkWalletDep & FetchDep
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
  }): Task<PaymentId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) => {
      if (cashRegister) {
        run.deps.evolu.update(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id: input.id,
          }),
          options
        )
      }

      if (spark) {
        run.deps.evolu.update(
          "paymentSpark",
          removeUndefinedValues({
            ...spark,
            id: input.id,
          }),
          options
        )
      }

      if (iban) {
        run.deps.evolu.update(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id: input.id,
          }),
          options
        )
      }

      return run.deps.evolu.update(
        "payment",
        removeUndefinedValues(input),
        options
      )
    })

    return ok(input.id)
  }

export const deletePayment =
  (paymentId: PaymentId): Task<PaymentId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          isDeleted: sqliteTrue,
        },
        options
      )
    )

    return ok(paymentId)
  }

export const markPaymentPaid =
  (
    paymentId: PaymentId,
    accountTransactionId: AccountTransactionId,
    source: ReconciliationClaimSource = "manual"
  ): Task<PaymentId, never, EvoluDep> =>
  async (run) => {
    const id = createTableId<"ReconciliationClaim">()

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "reconciliationClaim",
        removeUndefinedValues({
          id,
          deviceId: null,
          paymentId,
          accountTransactionId,
          source,
          claimedAt: Date.now(),
        }),
        options
      )
    )

    return ok(paymentId)
  }

export const cancelPayment =
  (paymentId: PaymentId): Task<PaymentId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "payment",
        {
          id: paymentId,
          canceledAt: Date.now(),
        },
        options
      )
    )

    return ok(paymentId)
  }
