import { SparkWallet } from "@buildonspark/spark-sdk"
import { evoluJsonObjectFrom, ok, type Task } from "@evolu/common"
import { type Command, createCommand } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createQuery } from "../src/core/evolu/schema"
import {
  createAccount,
  deleteAccount,
  loadAccount,
  updateAccount,
} from "../src/core/modules/account/account-actions"
import { AccountId } from "../src/core/modules/account/account-types"
import { DeviceId } from "../src/core/modules/device/device-types"
import {
  createMasterKey,
  deriveDefaultSparkWalletSecret,
  SparkSecretSchema,
  sparkSecretToMnemonic,
} from "../src/core/modules/shared/key-derivation"
import {
  AccountKindSchema,
  FiatCurrencySchema,
  IbanSchema,
  NonEmptyString255Schema,
} from "../src/core/modules/shared/schema"

declare const process: {
  exitCode?: number
}

const accountsWithDetailsQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .select((eb) => [
      "account.id",
      "account.deviceId",
      "account.name",
      "account.kind",
      evoluJsonObjectFrom(
        eb
          .selectFrom("accountIban")
          .select(["accountIban.iban", "accountIban.currency"])
          .whereRef("accountIban.id", "=", "account.id")
      ).as("iban"),
      evoluJsonObjectFrom(
        eb
          .selectFrom("accountSpark")
          .select(["accountSpark.secret"])
          .whereRef("accountSpark.id", "=", "account.id")
      ).as("spark"),
      evoluJsonObjectFrom(
        eb
          .selectFrom("accountCashRegister")
          .select(["accountCashRegister.currency"])
          .whereRef("accountCashRegister.id", "=", "account.id")
      ).as("cashRegister"),
    ])
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .where("account.isDeleted", "is", null)
    .orderBy("account.name")
)

const accountWithDetailsByIdQuery = (id: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .select((eb) => [
        "account.id",
        "account.deviceId",
        "account.name",
        "account.kind",
        "account.isDeleted",
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountIban")
            .select(["accountIban.iban", "accountIban.currency"])
            .whereRef("accountIban.id", "=", "account.id")
        ).as("iban"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountSpark")
            .select(["accountSpark.secret"])
            .whereRef("accountSpark.id", "=", "account.id")
        ).as("spark"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountCashRegister")
            .select(["accountCashRegister.currency"])
            .whereRef("accountCashRegister.id", "=", "account.id")
        ).as("cashRegister"),
      ])
      .where("account.id", "=", id)
  )

const SparkNetworkSchema = z.enum([
  "MAINNET",
  "TESTNET",
  "SIGNET",
  "REGTEST",
  "LOCAL",
])

export const registerAccountsCommand =
  (program: Command): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  (run) => {
    const { evolu } = run.deps

    const printInvalidAccountInput = (message: string): void => {
      run.deps.console.error(message)
      process.exitCode = 1
    }

    const accountsCommand = createCommand("accounts").description(
      "Manage payment accounts."
    )

    accountsCommand

      .addCommand(
        zodCommand({
          name: "list",
          description: "List active accounts with account-specific details.",
          args: {},
          opts: {},
          async action() {
            run.deps.console.table(
              await evolu.loadQuery(accountsWithDetailsQuery)
            )
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "get",
          description: "Show one account by id.",
          args: {},
          opts: {
            id: AccountId.describe("Account id"),
          },
          async action(_, options) {
            run.deps.console.table(
              await evolu.loadQuery(accountWithDetailsByIdQuery(options.id))
            )
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "create",
          description: "Create an account of the selected kind.",
          args: {},
          opts: {
            name: NonEmptyString255Schema.describe("n;Account name"),
            kind: AccountKindSchema.describe("k;Account kind"),
            deviceId: DeviceId.optional().describe(
              "Device id that created the account"
            ),
            iban: IbanSchema.optional().describe("IBAN for bank accounts"),
            currency: FiatCurrencySchema.optional().describe(
              "c;Currency for IBAN or cash register accounts"
            ),
            secret: SparkSecretSchema.optional().describe(
              "s;Spark wallet secret as 16-byte hex"
            ),
          },
          async action(_, options) {
            const root = {
              deviceId: options.deviceId ?? null,
              name: options.name,
            }

            if (options.kind === "iban") {
              if (
                options.iban === undefined ||
                options.currency === undefined
              ) {
                printInvalidAccountInput(
                  "IBAN account requires --iban and --currency."
                )
                return
              }

              const id = await run.orThrow(
                createAccount({
                  ...root,
                  iban: {
                    iban: options.iban,
                    currency: options.currency,
                  },
                })
              )
              run.deps.console.log(`Inserted account ${id}`)
              return
            }

            if (options.kind === "spark") {
              if (options.secret === undefined) {
                printInvalidAccountInput("Spark account requires --secret.")
                return
              }

              const id = await run.orThrow(
                createAccount({
                  ...root,
                  spark: {
                    secret: options.secret,
                  },
                })
              )
              run.deps.console.log(`Inserted account ${id}`)
              return
            }

            if (options.currency === undefined) {
              printInvalidAccountInput(
                "Cash register account requires --currency."
              )
              return
            }

            const id = await run.orThrow(
              createAccount({
                ...root,
                cashRegister: {
                  currency: options.currency,
                },
              })
            )
            run.deps.console.log(`Inserted account ${id}`)
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "generate-spark",
          description:
            "Generate a Spark wallet and store it as a Spark account.",
          args: {},
          opts: {
            name: NonEmptyString255Schema.describe("n;Account name"),
            deviceId: DeviceId.optional().describe(
              "Device id that created the account"
            ),
            network: SparkNetworkSchema.optional().describe("w;Spark network"),
          },
          async action(_, options) {
            const network = options.network ?? "MAINNET"

            run.deps.console.log({
              options: {
                network,
              },
            })

            const secret = deriveDefaultSparkWalletSecret(createMasterKey())
            const { wallet } = await SparkWallet.initialize({
              mnemonicOrSeed: sparkSecretToMnemonic(secret),
              options: {
                network,
              },
            })

            try {
              const id = await run.orThrow(
                createAccount({
                  deviceId: options.deviceId ?? null,
                  name: options.name,
                  spark: {
                    secret,
                  },
                })
              )

              run.deps.console.log(
                `Inserted Spark account ${id}: ${JSON.stringify({
                  id,
                  name: options.name,
                  network,
                  secret,
                  mnemonic: sparkSecretToMnemonic(secret),
                })}`
              )
            } finally {
              await wallet.cleanup()
            }
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "update",
          description:
            "Update an account and its current kind-specific details.",
          args: {},
          opts: {
            id: AccountId.describe("Account id"),
            name: NonEmptyString255Schema.optional().describe("n;Account name"),
            deviceId: DeviceId.optional().describe(
              "Device id that updated the account"
            ),
            iban: IbanSchema.optional().describe("IBAN for bank accounts"),
            currency: FiatCurrencySchema.optional().describe(
              "c;Currency for IBAN or cash register accounts"
            ),
            secret: SparkSecretSchema.optional().describe(
              "s;Spark wallet secret as 16-byte hex"
            ),
          },
          async action(_, options) {
            const account = await run.orThrow(loadAccount(options.id))
            if (account.kind === "iban") {
              await run.orThrow(
                updateAccount({
                  id: options.id,
                  deviceId: options.deviceId,
                  name: options.name,
                  iban: {
                    iban: options.iban,
                    currency: options.currency,
                  },
                })
              )

              run.deps.console.log(`Updated account ${options.id}`)
              return
            }

            if (account.kind === "spark") {
              await run.orThrow(
                updateAccount({
                  id: options.id,
                  deviceId: options.deviceId,
                  name: options.name,
                  spark: {
                    secret: options.secret,
                  },
                })
              )
              run.deps.console.log(`Updated account ${options.id}`)
              return
            }

            await run.orThrow(
              updateAccount({
                id: options.id,
                deviceId: options.deviceId,
                name: options.name,
                cashRegister: {
                  currency: options.currency,
                },
              })
            )
            run.deps.console.log(`Updated account ${options.id}`)
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "delete",
          description: "Soft delete an account.",
          args: {},
          opts: {
            id: AccountId.describe("Account id"),
          },
          async action(_, options) {
            await run.orThrow(deleteAccount(options.id))
            run.deps.console.log(`Deleted account ${options.id}`)
          },
        })
      )

    program.addCommand(accountsCommand)
    return ok(undefined)
  }
