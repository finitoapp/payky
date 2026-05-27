import { evoluJsonObjectFrom } from "@evolu/common"
import { createCommand } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"
import { createEvoluCli } from "../src/core/evolu/cli-client"
import { createQuery } from "../src/core/evolu/schema"
import { fetchYadioBtcExchangeRate } from "../src/core/integrations/yadio/yadio-client"
import { AccountId } from "../src/core/modules/account/account-types"
import { BillId } from "../src/core/modules/bill/bill-types"
import { DeviceId } from "../src/core/modules/device/device-types"
import {
  createDefaultSparkPaymentWallet,
  createPreparedPayment,
  deletePayment,
  loadPayment,
  updatePayment,
} from "../src/core/modules/payment/payment-actions"
import { PaymentId } from "../src/core/modules/payment/payment-types"
import {
  FiatCurrencySchema,
  NonEmptyStringSchema,
  NonNegativeIntegerFromStringSchema,
  PositiveNumberFromStringSchema,
  TimestampMsSchema,
  VariableSymbolSchema,
} from "../src/core/modules/shared/schema"
import { TableId } from "../src/core/modules/table/table-types"

declare const process: {
  exitCode?: number
}

const TimestampMsFromStringSchema = z.string().transform((value, ctx) => {
  const trimmed = value.trim()
  const timestamp = /^\d+$/u.test(trimmed)
    ? Number(trimmed)
    : Date.parse(trimmed)
  const parsed = TimestampMsSchema.safeParse(timestamp)

  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      message: "Expected a timestamp in milliseconds or a valid date string.",
    })
    return z.NEVER
  }

  return parsed.data
})

const paymentsWithDetailsQuery = createQuery((db) =>
  db
    .selectFrom("payment")
    .select((eb) => [
      "payment.id",
      "payment.deviceId",
      "payment.billId",
      "payment.tableId",
      "payment.amount",
      "payment.currency",
      "payment.tipAmount",
      "payment.canceledAt",
      evoluJsonObjectFrom(
        eb
          .selectFrom("paymentCashRegister")
          .select(["paymentCashRegister.accountId"])
          .whereRef("paymentCashRegister.id", "=", "payment.id")
      ).as("cashRegister"),
      evoluJsonObjectFrom(
        eb
          .selectFrom("paymentSpark")
          .select([
            "paymentSpark.accountId",
            "paymentSpark.amountSats",
            "paymentSpark.exchangeRate",
            "paymentSpark.exchangeRateSource",
            "paymentSpark.exchangeRateFetchedAt",
            "paymentSpark.lnInvoice",
            "paymentSpark.sparkTechnicalData",
          ])
          .whereRef("paymentSpark.id", "=", "payment.id")
      ).as("spark"),
      evoluJsonObjectFrom(
        eb
          .selectFrom("paymentIban")
          .select([
            "paymentIban.accountId",
            "paymentIban.variableSymbol",
            "paymentIban.czQrPayload",
          ])
          .whereRef("paymentIban.id", "=", "payment.id")
      ).as("iban"),
    ])
    .where("payment.amount", "is not", null)
    .where("payment.currency", "is not", null)
    .where("payment.tipAmount", "is not", null)
    .where("payment.isDeleted", "is", null)
    .orderBy("payment.createdAt", "desc")
)

const paymentWithDetailsByIdQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .select((eb) => [
        "payment.id",
        "payment.deviceId",
        "payment.billId",
        "payment.tableId",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.isDeleted",
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentCashRegister")
            .select(["paymentCashRegister.accountId"])
            .whereRef("paymentCashRegister.id", "=", "payment.id")
        ).as("cashRegister"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentSpark")
            .select([
              "paymentSpark.accountId",
              "paymentSpark.amountSats",
              "paymentSpark.exchangeRate",
              "paymentSpark.exchangeRateSource",
              "paymentSpark.exchangeRateFetchedAt",
              "paymentSpark.lnInvoice",
              "paymentSpark.sparkTechnicalData",
            ])
            .whereRef("paymentSpark.id", "=", "payment.id")
        ).as("spark"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentIban")
            .select([
              "paymentIban.accountId",
              "paymentIban.variableSymbol",
              "paymentIban.czQrPayload",
            ])
            .whereRef("paymentIban.id", "=", "payment.id")
        ).as("iban"),
      ])
      .where("payment.id", "=", id)
  )

const printPaymentNotFound = (id: PaymentId): void => {
  console.error(`payment not found: ${id}`)
  process.exitCode = 1
}

const printInvalidPaymentInput = (message: string): void => {
  console.error(message)
  process.exitCode = 1
}

export const paymentsCommand = createCommand("payments").description(
  "Manage payment requests and receipts."
)

paymentsCommand

  .addCommand(
    zodCommand({
      name: "list",
      description: "List active payments with payment method details.",
      args: {},
      opts: {},
      async action() {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.log(
          JSON.stringify(
            await evolu.loadQuery(paymentsWithDetailsQuery),
            null,
            2
          )
        )

        console.table(await evolu.loadQuery(paymentsWithDetailsQuery))
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "get",
      description: "Show one payment by id.",
      args: {},
      opts: {
        id: PaymentId.describe("Payment id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.table(
          await evolu.loadQuery(paymentWithDetailsByIdQuery(options.id))
        )
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "create",
      description: "Create a payment with optional method-specific details.",
      args: {},
      opts: {
        amount: NonNegativeIntegerFromStringSchema.describe("a;Payment amount"),
        currency: FiatCurrencySchema.describe("c;Payment currency"),
        tipAmount: NonNegativeIntegerFromStringSchema.describe("t;Tip amount"),
        deviceId: DeviceId.optional().describe(
          "Device id that created the payment"
        ),
        billId: BillId.optional().describe("Related bill id"),
        tableId: TableId.optional().describe("Related table id"),
        canceledAt: TimestampMsFromStringSchema.optional().describe(
          "Cancellation timestamp, as milliseconds or a date string"
        ),
        cashRegisterAccountId: AccountId.optional().describe(
          "Cash register account id"
        ),
        sparkAccountId: AccountId.optional().describe("Spark account id"),
        ibanAccountId: AccountId.optional().describe("IBAN account id"),
        variableSymbol: VariableSymbolSchema.optional().describe(
          "IBAN variable symbol"
        ),
        czQrPayload: NonEmptyStringSchema.optional().describe(
          "CZ QR payment payload"
        ),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const hasIbanInput =
          options.ibanAccountId != null ||
          options.variableSymbol != null ||
          options.czQrPayload != null

        const iban = (() => {
          if (!hasIbanInput) return undefined

          const { ibanAccountId, variableSymbol, czQrPayload } = options

          if (ibanAccountId == null || czQrPayload == null) {
            printInvalidPaymentInput(
              "IBAN payment requires --ibanAccountId and --czQrPayload."
            )
            return null
          }

          return {
            accountId: ibanAccountId,
            variableSymbol: variableSymbol ?? null,
            czQrPayload,
          }
        })()
        if (iban === null) return

        const paymentResult = await createPreparedPayment({
          evolu,
          fetchYadioBtcExchangeRate,
          create: createDefaultSparkPaymentWallet,
        })({
          deviceId: options.deviceId ?? null,
          billId: options.billId ?? null,
          tableId: options.tableId ?? null,
          amount: options.amount,
          currency: options.currency,
          tipAmount: options.tipAmount,
          canceledAt: options.canceledAt ?? null,
          ...(options.cashRegisterAccountId == null
            ? {}
            : {
                cashRegister: {
                  accountId: options.cashRegisterAccountId,
                },
              }),
          ...(options.sparkAccountId == null
            ? {}
            : {
                spark: {
                  accountId: options.sparkAccountId,
                },
              }),
          ...(iban == null ? {} : { iban }),
        })

        if (!paymentResult.ok) {
          printInvalidPaymentInput(
            paymentResult.error.type === "NotFound"
              ? `${paymentResult.error.entity} not found: ${paymentResult.error.id}`
              : paymentResult.error.message
          )
          return
        }

        console.log(`Inserted payment ${paymentResult.value}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "update",
      description: "Update a payment and optional method-specific details.",
      args: {},
      opts: {
        id: PaymentId.describe("Payment id"),
        amount:
          NonNegativeIntegerFromStringSchema.optional().describe(
            "a;Payment amount"
          ),
        currency: FiatCurrencySchema.optional().describe("c;Payment currency"),
        tipAmount:
          NonNegativeIntegerFromStringSchema.optional().describe(
            "t;Tip amount"
          ),
        deviceId: DeviceId.optional().describe(
          "Device id that updated the payment"
        ),
        billId: BillId.optional().describe("Related bill id"),
        tableId: TableId.optional().describe("Related table id"),
        canceledAt: TimestampMsFromStringSchema.optional().describe(
          "Cancellation timestamp, as milliseconds or a date string"
        ),
        cashRegisterAccountId: AccountId.optional().describe(
          "Cash register account id"
        ),
        sparkAccountId: AccountId.optional().describe("Spark account id"),
        amountSats: NonNegativeIntegerFromStringSchema.optional().describe(
          "Spark amount in satoshis"
        ),
        exchangeRate: PositiveNumberFromStringSchema.optional().describe(
          "Spark exchange rate"
        ),
        exchangeRateFetchedAt: TimestampMsFromStringSchema.optional().describe(
          "Exchange rate fetch time, as milliseconds or a date string"
        ),
        lnInvoice:
          NonEmptyStringSchema.optional().describe("Lightning invoice"),
        sparkTechnicalData: z
          .string()
          .optional()
          .describe("Spark technical metadata"),
        ibanAccountId: AccountId.optional().describe("IBAN account id"),
        variableSymbol: VariableSymbolSchema.optional().describe(
          "IBAN variable symbol"
        ),
        czQrPayload: NonEmptyStringSchema.optional().describe(
          "CZ QR payment payload"
        ),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const paymentResult = await loadPayment({ evolu })(options.id)
        if (!paymentResult.ok) {
          printPaymentNotFound(options.id)
          return
        }

        const hasSparkInput =
          options.sparkAccountId != null ||
          options.amountSats != null ||
          options.exchangeRate != null ||
          options.exchangeRateFetchedAt != null ||
          options.lnInvoice != null ||
          options.sparkTechnicalData != null
        const hasIbanInput =
          options.ibanAccountId != null ||
          options.variableSymbol != null ||
          options.czQrPayload != null

        await updatePayment({ evolu })({
          id: options.id,
          deviceId: options.deviceId,
          billId: options.billId,
          tableId: options.tableId,
          amount: options.amount,
          currency: options.currency,
          tipAmount: options.tipAmount,
          canceledAt: options.canceledAt,
          ...(options.cashRegisterAccountId == null
            ? {}
            : {
                cashRegister: {
                  accountId: options.cashRegisterAccountId,
                },
              }),
          ...(hasSparkInput
            ? {
                spark: {
                  accountId: options.sparkAccountId,
                  amountSats: options.amountSats,
                  exchangeRate: options.exchangeRate,
                  exchangeRateSource: undefined,
                  exchangeRateFetchedAt: options.exchangeRateFetchedAt,
                  lnInvoice: options.lnInvoice,
                  sparkTechnicalData: options.sparkTechnicalData,
                },
              }
            : {}),
          ...(hasIbanInput
            ? {
                iban: {
                  accountId: options.ibanAccountId,
                  variableSymbol: options.variableSymbol,
                  czQrPayload: options.czQrPayload,
                },
              }
            : {}),
        })

        console.log(`Updated payment ${options.id}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "delete",
      description: "Soft delete a payment.",
      args: {},
      opts: {
        id: PaymentId.describe("Payment id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        await deletePayment({ evolu })(options.id)
        console.log(`Deleted payment ${options.id}`)
      },
    })
  )
