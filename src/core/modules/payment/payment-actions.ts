import { SparkWallet } from "@buildonspark/spark-sdk"
import {
  err,
  type InsertValues,
  ok,
  type Result,
  sqliteTrue,
  type UpdateValues,
} from "@evolu/common"
import type { ExchangeRateDep } from "@/core/integrations/yadio/yadio-client.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
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
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import {
  type ActionError,
  getFirst,
  invalidOperation,
  notFound,
} from "../shared/action-error.ts"
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

interface SparkLightningInvoice {
  readonly id?: string
  readonly invoice: {
    readonly encodedInvoice: string
    readonly paymentHash?: string
  }
  readonly paymentPreimage?: string
  readonly sparkInvoice?: string
}

export interface SparkPaymentWallet {
  readonly createLightningInvoice: (params: {
    readonly amountSats: number
    readonly memo?: string
    readonly expirySeconds?: number
    readonly includeSparkInvoice?: boolean
  }) => Promise<SparkLightningInvoice>
  readonly cleanup?: () => void | Promise<void>
}

export type SparkWalletFactoryDep = {
  readonly create: (mnemonic: string) => Promise<SparkPaymentWallet>
}

export const createDefaultSparkPaymentWallet = async (
  mnemonic: string
): Promise<SparkPaymentWallet> => {
  const { wallet } = await SparkWallet.getOrCreateWallet({
    mnemonicOrSeed: mnemonic,
    options: {
      network: "MAINNET",
    },
  })

  return {
    createLightningInvoice: (params) => wallet.createLightningInvoice(params),
    cleanup: () => wallet.cleanup(),
  }
}

const convertFiatMinorUnitsToSats = (
  amount: number,
  exchangeRate: number
): number => {
  if (amount === 0) return 0

  const fiatAmount = amount / FIAT_MINOR_UNITS
  return Math.max(1, Math.round((fiatAmount / exchangeRate) * SATS_PER_BTC))
}

export const loadPayment =
  (deps: EvoluDep) =>
  async (idValue: PaymentId): Promise<Result<PaymentRow, ActionError>> =>
    getFirst(
      await deps.evolu.loadQuery(paymentByIdQuery(idValue)),
      "payment",
      idValue
    )

export const createPayment =
  (deps: EvoluDep) =>
  async ({
    cashRegister,
    spark,
    iban,
    ...input
  }: InsertValues<typeof payment> & {
    readonly cashRegister?: Omit<InsertValues<typeof paymentCashRegister>, "id">
    readonly spark?: Omit<InsertValues<typeof paymentSpark>, "id">
    readonly iban?: Omit<InsertValues<typeof paymentIban>, "id">
  }): Promise<PaymentId> => {
    const id = createTableId<"Payment">()

    await runMutationWithCompletion((options) => {
      if (cashRegister) {
        deps.evolu.upsert(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id,
          }),
          options
        )
      }

      if (spark) {
        deps.evolu.upsert(
          "paymentSpark",
          removeUndefinedValues({
            ...spark,
            id,
          }),
          options
        )
      }

      if (iban) {
        deps.evolu.upsert(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id,
          }),
          options
        )
      }

      return deps.evolu.upsert(
        "payment",
        removeUndefinedValues({
          ...input,
          id,
        }),
        options
      )
    })

    return id
  }

export const createPreparedPayment =
  (deps: EvoluDep & ExchangeRateDep & SparkWalletFactoryDep) =>
  async ({
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
  }): Promise<Result<PaymentId, ActionError>> => {
    if (!spark) {
      return ok(await createPayment(deps)(input))
    }

    const sparkAccounts = await deps.evolu.loadQuery(activeSparkAccountsQuery)
    const sparkAccount = sparkAccounts.find(
      (account) => account.id === spark.accountId
    )
    if (!sparkAccount) {
      return err(notFound("accountSpark", spark.accountId))
    }

    let wallet: SparkPaymentWallet | undefined
    try {
      const quote = await deps.fetchYadioBtcExchangeRate(input.currency)
      const amountSats = NonNegativeIntegerSchema.decode(
        convertFiatMinorUnitsToSats(input.amount, quote.exchangeRate)
      )
      wallet = await deps.create(sparkAccount.mnemonic)
      const lightningInvoice = await wallet.createLightningInvoice(
        removeUndefinedValues({
          amountSats,
          memo: spark.memo,
          expirySeconds: spark.expirySeconds,
          includeSparkInvoice: spark.includeSparkInvoice ?? true,
        })
      )

      const id = await createPayment(deps)({
        ...input,
        spark: {
          accountId: spark.accountId,
          amountSats,
          exchangeRate: PositiveNumberSchema.decode(quote.exchangeRate),
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: TimestampMsSchema.decode(quote.fetchedAt),
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

      return ok(id)
    } catch (error) {
      return err(
        invalidOperation(
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
  (deps: EvoluDep) =>
  async ({
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
  }): Promise<PaymentId> => {
    await runMutationWithCompletion((options) => {
      if (cashRegister) {
        deps.evolu.update(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id: input.id,
          }),
          options
        )
      }

      if (spark) {
        deps.evolu.update(
          "paymentSpark",
          removeUndefinedValues({
            ...spark,
            id: input.id,
          }),
          options
        )
      }

      if (iban) {
        deps.evolu.update(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id: input.id,
          }),
          options
        )
      }

      return deps.evolu.update("payment", removeUndefinedValues(input), options)
    })

    return input.id
  }

export const deletePayment =
  (deps: EvoluDep) =>
  async (paymentId: PaymentId): Promise<PaymentId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "payment",
        {
          id: paymentId,
          isDeleted: sqliteTrue,
        },
        options
      )
    )

    return paymentId
  }

export const markPaymentPaid =
  (deps: EvoluDep) =>
  async (
    paymentId: PaymentId,
    accountTransactionId: AccountTransactionId,
    source: ReconciliationClaimSource = "manual"
  ): Promise<PaymentId> => {
    const id = createTableId<"ReconciliationClaim">()

    await runMutationWithCompletion((options) =>
      deps.evolu.upsert(
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

    return paymentId
  }

export const cancelPayment =
  (deps: EvoluDep) =>
  async (paymentId: PaymentId): Promise<PaymentId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "payment",
        {
          id: paymentId,
          canceledAt: Date.now(),
        },
        options
      )
    )

    return paymentId
  }
