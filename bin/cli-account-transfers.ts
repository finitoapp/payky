import { evoluJsonObjectFrom, ok, type Task } from "@evolu/common"
import { type Command, createCommand } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createQuery } from "../src/core/evolu/schema"
import { AccountId } from "../src/core/modules/account/account-types"
import {
  createAccountTransaction,
  deleteAccountTransaction,
  updateAccountTransaction,
} from "../src/core/modules/account-transaction/account-transaction-actions"
import { AccountTransactionId } from "../src/core/modules/account-transaction/account-transaction-types"
import { DeviceId } from "../src/core/modules/device/device-types"
import {
  AccountKindSchema,
  ConstantSymbolSchema,
  CurrencySchema,
  IntegerFromStringSchema,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  SpecificSymbolSchema,
  TimestampMsSchema,
  VariableSymbolSchema,
} from "../src/core/modules/shared/schema"

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

const accountTransfersWithDetailsQuery = createQuery((db) =>
  db
    .selectFrom("accountTransaction")
    .select((eb) => [
      "accountTransaction.id",
      "accountTransaction.accountId",
      "accountTransaction.kind",
      "accountTransaction.amount",
      "accountTransaction.currency",
      "accountTransaction.occurredAt",
      "accountTransaction.note",
      "accountTransaction.internalTransferGroupId",
      evoluJsonObjectFrom(
        eb
          .selectFrom("accountTransactionIban")
          .select([
            "accountTransactionIban.variableSymbol",
            "accountTransactionIban.constantSymbol",
            "accountTransactionIban.specificSymbol",
            "accountTransactionIban.bankReference",
          ])
          .whereRef("accountTransactionIban.id", "=", "accountTransaction.id")
      ).as("iban"),
      evoluJsonObjectFrom(
        eb
          .selectFrom("accountTransactionSpark")
          .select([
            "accountTransactionSpark.sparkTransferId",
            "accountTransactionSpark.lnInvoice",
            "accountTransactionSpark.preImage",
            "accountTransactionSpark.paymentHash",
          ])
          .whereRef("accountTransactionSpark.id", "=", "accountTransaction.id")
      ).as("spark"),
    ])
    .where("accountTransaction.accountId", "is not", null)
    .where("accountTransaction.kind", "is not", null)
    .where("accountTransaction.amount", "is not", null)
    .where("accountTransaction.currency", "is not", null)
    .where("accountTransaction.occurredAt", "is not", null)
    .where("accountTransaction.isDeleted", "is", null)
    .orderBy("accountTransaction.occurredAt", "desc")
)

const accountTransferWithDetailsByIdQuery = (id: AccountTransactionId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .select((eb) => [
        "accountTransaction.id",
        "accountTransaction.accountId",
        "accountTransaction.kind",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransaction.occurredAt",
        "accountTransaction.note",
        "accountTransaction.internalTransferGroupId",
        "accountTransaction.isDeleted",
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountTransactionIban")
            .select([
              "accountTransactionIban.variableSymbol",
              "accountTransactionIban.constantSymbol",
              "accountTransactionIban.specificSymbol",
              "accountTransactionIban.bankReference",
            ])
            .whereRef("accountTransactionIban.id", "=", "accountTransaction.id")
        ).as("iban"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountTransactionSpark")
            .select([
              "accountTransactionSpark.sparkTransferId",
              "accountTransactionSpark.lnInvoice",
              "accountTransactionSpark.preImage",
              "accountTransactionSpark.paymentHash",
            ])
            .whereRef(
              "accountTransactionSpark.id",
              "=",
              "accountTransaction.id"
            )
        ).as("spark"),
      ])
      .where("accountTransaction.id", "=", id)
  )

const formatAccountTransferListCell = (
  value: unknown
): string | number | boolean | null => {
  if (value == null) return null

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  return JSON.stringify(value, null, 2)
}

const formatAccountTransferListRows = <Row extends object>(
  rows: ReadonlyArray<Row>
): Array<Record<string, string | number | boolean | null>> =>
  rows.map((row) => {
    const formattedRow: Record<string, string | number | boolean | null> = {}

    for (const [key, value] of Object.entries(row)) {
      formattedRow[key] = formatAccountTransferListCell(value)
    }

    return formattedRow
  })

export const registerAccountTransfersCommand =
  (program: Command): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  (run) => {
    const { evolu } = run.deps

    const printAccountTransferNotFound = (id: AccountTransactionId): void => {
      run.deps.console.error(`accountTransfer not found: ${id}`)
      process.exitCode = 1
    }

    const printInvalidAccountTransferInput = (message: string): void => {
      run.deps.console.error(message)
      process.exitCode = 1
    }

    const accountTransfersCommand = createCommand(
      "account-transfers"
    ).description("Manage account transfer records.")

    accountTransfersCommand

      .addCommand(
        zodCommand({
          name: "list",
          description:
            "List active account transfers with payment rail details.",
          args: {},
          opts: {},
          async action() {
            const accountTransfers = await evolu.loadQuery(
              accountTransfersWithDetailsQuery
            )
            run.deps.console.table(
              formatAccountTransferListRows(accountTransfers)
            )
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "get",
          description: "Show one account transfer by id.",
          args: {},
          opts: {
            id: AccountTransactionId.describe("Account transfer id"),
          },
          async action(_, options) {
            run.deps.console.table(
              await evolu.loadQuery(
                accountTransferWithDetailsByIdQuery(options.id)
              )
            )
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "create",
          description: "Create an account transfer.",
          args: {},
          opts: {
            accountId: AccountId.describe("Account id"),
            kind: AccountKindSchema.describe("k;Transfer kind"),
            amount: IntegerFromStringSchema.describe(
              "a;Signed transfer amount"
            ),
            currency: CurrencySchema.describe("c;Transfer currency"),
            occurredAt: TimestampMsFromStringSchema.describe(
              "o;When the transfer occurred, as milliseconds or a date string"
            ),
            deviceId: DeviceId.optional().describe(
              "Device id that created the transfer"
            ),
            note: NonEmptyStringSchema.optional().describe("n;Transfer note"),
            internalTransferGroupId:
              NonEmptyString255Schema.optional().describe(
                "Internal transfer group id"
              ),
            variableSymbol: VariableSymbolSchema.optional().describe(
              "IBAN variable symbol"
            ),
            constantSymbol: ConstantSymbolSchema.optional().describe(
              "IBAN constant symbol"
            ),
            specificSymbol: SpecificSymbolSchema.optional().describe(
              "IBAN specific symbol"
            ),
            bankReference: NonEmptyString255Schema.optional().describe(
              "Bank transaction reference"
            ),
            sparkTransferId:
              NonEmptyStringSchema.optional().describe("Spark transfer id"),
            lnInvoice:
              NonEmptyStringSchema.optional().describe("Lightning invoice"),
            preImage:
              NonEmptyStringSchema.optional().describe("Lightning preimage"),
            paymentHash: NonEmptyStringSchema.optional().describe(
              "Lightning payment hash"
            ),
          },
          async action(_, options) {
            const root = {
              accountId: options.accountId,
              amount: options.amount,
              currency: options.currency,
              occurredAt: options.occurredAt,
              note: options.note ?? null,
              internalTransferGroupId: options.internalTransferGroupId ?? null,
              source: {
                deviceId: options.deviceId ?? null,
                source: "manual" as const,
              },
            }

            if (options.kind === "iban") {
              if (options.bankReference == null) {
                printInvalidAccountTransferInput(
                  "IBAN account transfer requires --bankReference."
                )
                return
              }

              const id = await run.orThrow(
                createAccountTransaction({
                  ...root,
                  iban: {
                    variableSymbol: options.variableSymbol ?? null,
                    constantSymbol: options.constantSymbol ?? null,
                    specificSymbol: options.specificSymbol ?? null,
                    bankReference: options.bankReference,
                  },
                })
              )
              run.deps.console.log(`Inserted accountTransfer ${id}`)
              return
            }

            if (options.kind === "spark") {
              if (
                options.sparkTransferId == null ||
                options.lnInvoice == null ||
                options.preImage == null ||
                options.paymentHash == null
              ) {
                printInvalidAccountTransferInput(
                  "Spark account transfer requires --sparkTransferId, --lnInvoice, --preImage and --paymentHash."
                )
                return
              }

              const id = await run.orThrow(
                createAccountTransaction({
                  ...root,
                  spark: {
                    sparkTransferId: options.sparkTransferId,
                    lnInvoice: options.lnInvoice,
                    preImage: options.preImage,
                    paymentHash: options.paymentHash,
                  },
                })
              )
              run.deps.console.log(`Inserted accountTransfer ${id}`)
              return
            }

            const id = await run.orThrow(createAccountTransaction(root))
            run.deps.console.log(`Inserted accountTransfer ${id}`)
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "update",
          description:
            "Update an account transfer and its current kind details.",
          args: {},
          opts: {
            id: AccountTransactionId.describe("Account transfer id"),
            accountId: AccountId.optional().describe("Account id"),
            amount: IntegerFromStringSchema.optional().describe(
              "a;Signed transfer amount"
            ),
            currency: CurrencySchema.optional().describe("c;Transfer currency"),
            occurredAt: TimestampMsFromStringSchema.optional().describe(
              "o;When the transfer occurred, as milliseconds or a date string"
            ),
            note: NonEmptyStringSchema.optional().describe("n;Transfer note"),
            internalTransferGroupId:
              NonEmptyString255Schema.optional().describe(
                "Internal transfer group id"
              ),
            variableSymbol: VariableSymbolSchema.optional().describe(
              "IBAN variable symbol"
            ),
            constantSymbol: ConstantSymbolSchema.optional().describe(
              "IBAN constant symbol"
            ),
            specificSymbol: SpecificSymbolSchema.optional().describe(
              "IBAN specific symbol"
            ),
            bankReference: NonEmptyString255Schema.optional().describe(
              "Bank transaction reference"
            ),
            sparkTransferId:
              NonEmptyStringSchema.optional().describe("Spark transfer id"),
            lnInvoice:
              NonEmptyStringSchema.optional().describe("Lightning invoice"),
            preImage:
              NonEmptyStringSchema.optional().describe("Lightning preimage"),
            paymentHash: NonEmptyStringSchema.optional().describe(
              "Lightning payment hash"
            ),
          },
          async action(_, options) {
            const [accountTransfer] = await evolu.loadQuery(
              accountTransferWithDetailsByIdQuery(options.id)
            )
            if (accountTransfer == null || accountTransfer.kind == null) {
              printAccountTransferNotFound(options.id)
              return
            }

            const root = {
              id: options.id,
              accountId: options.accountId,
              amount: options.amount,
              currency: options.currency,
              occurredAt: options.occurredAt,
              note: options.note,
              internalTransferGroupId: options.internalTransferGroupId,
            }

            if (accountTransfer.kind === "iban") {
              await run.orThrow(
                updateAccountTransaction({
                  ...root,
                  iban: {
                    variableSymbol: options.variableSymbol,
                    constantSymbol: options.constantSymbol,
                    specificSymbol: options.specificSymbol,
                    bankReference: options.bankReference,
                  },
                })
              )
              run.deps.console.log(`Updated accountTransfer ${options.id}`)
              return
            }

            if (accountTransfer.kind === "spark") {
              await run.orThrow(
                updateAccountTransaction({
                  ...root,
                  spark: {
                    sparkTransferId: options.sparkTransferId,
                    lnInvoice: options.lnInvoice,
                    preImage: options.preImage,
                    paymentHash: options.paymentHash,
                  },
                })
              )
              run.deps.console.log(`Updated accountTransfer ${options.id}`)
              return
            }

            await run.orThrow(updateAccountTransaction(root))
            run.deps.console.log(`Updated accountTransfer ${options.id}`)
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "delete",
          description: "Soft delete an account transfer.",
          args: {},
          opts: {
            id: AccountTransactionId.describe("Account transfer id"),
          },
          async action(_, options) {
            await run.orThrow(deleteAccountTransaction(options.id))
            run.deps.console.log(`Deleted accountTransfer ${options.id}`)
          },
        })
      )

    program.addCommand(accountTransfersCommand)
    return ok(undefined)
  }
