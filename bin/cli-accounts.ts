import { SparkWallet } from "@buildonspark/spark-sdk"
import { evoluJsonObjectFrom } from "@evolu/common"
import { createCommand } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"
import { createEvoluCli } from "../src/core/evolu/cli-client"
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
          .select(["accountSpark.mnemonic"])
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
            .select(["accountSpark.mnemonic"])
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

const printAccountNotFound = (id: AccountId): void => {
  console.error(`account not found: ${id}`)
  process.exitCode = 1
}

const printInvalidAccountInput = (message: string): void => {
  console.error(message)
  process.exitCode = 1
}

const SparkNetworkSchema = z.enum([
  "MAINNET",
  "TESTNET",
  "SIGNET",
  "REGTEST",
  "LOCAL",
])

export const accountsCommand = createCommand("accounts").description(
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
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.table(await evolu.loadQuery(accountsWithDetailsQuery))
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
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.table(
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
        mnemonic: NonEmptyString255Schema.optional().describe(
          "m;Spark wallet mnemonic"
        ),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const root = {
          deviceId: options.deviceId ?? null,
          name: options.name,
        }

        if (options.kind === "iban") {
          if (options.iban == null || options.currency == null) {
            printInvalidAccountInput(
              "IBAN account requires --iban and --currency."
            )
            return
          }

          const id = await createAccount({ evolu })({
            ...root,
            iban: {
              iban: options.iban,
              currency: options.currency,
            },
          })
          console.log(`Inserted account ${id}`)
          return
        }

        if (options.kind === "spark") {
          if (options.mnemonic == null) {
            printInvalidAccountInput("Spark account requires --mnemonic.")
            return
          }

          const id = await createAccount({ evolu })({
            ...root,
            spark: {
              mnemonic: options.mnemonic,
            },
          })
          console.log(`Inserted account ${id}`)
          return
        }

        if (options.currency == null) {
          printInvalidAccountInput("Cash register account requires --currency.")
          return
        }

        const id = await createAccount({ evolu })({
          ...root,
          cashRegister: {
            currency: options.currency,
          },
        })
        console.log(`Inserted account ${id}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "generate-spark",
      description: "Generate a Spark wallet and store it as a Spark account.",
      args: {},
      opts: {
        name: NonEmptyString255Schema.describe("n;Account name"),
        deviceId: DeviceId.optional().describe(
          "Device id that created the account"
        ),
        network: SparkNetworkSchema.optional().describe("w;Spark network"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.log({
          options: {
            network: options.network ?? "MAINNET",
          },
        })

        const { wallet, mnemonic } = await SparkWallet.initialize({
          options: {
            network: options.network ?? "MAINNET",
          },
        })

        try {
          if (mnemonic == null) {
            printInvalidAccountInput("Spark wallet did not return a mnemonic.")
            return
          }

          const accountMnemonic = NonEmptyString255Schema.parse(mnemonic)
          const id = await createAccount({ evolu })({
            deviceId: options.deviceId ?? null,
            name: options.name,
            spark: {
              mnemonic: accountMnemonic,
            },
          })

          console.log(
            `Inserted Spark account ${id}: ${JSON.stringify({
              id,
              name: options.name,
              network: options.network ?? "MAINNET",
              mnemonic,
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
      description: "Update an account and its current kind-specific details.",
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
        mnemonic: NonEmptyString255Schema.optional().describe(
          "m;Spark wallet mnemonic"
        ),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const accountResult = await loadAccount({ evolu })(options.id)
        if (!accountResult.ok) {
          printAccountNotFound(options.id)
          return
        }

        if (accountResult.value.kind === "iban") {
          await updateAccount({ evolu })({
            id: options.id,
            deviceId: options.deviceId,
            name: options.name,
            iban: {
              iban: options.iban,
              currency: options.currency,
            },
          })
          console.log(`Updated account ${options.id}`)
          return
        }

        if (accountResult.value.kind === "spark") {
          await updateAccount({ evolu })({
            id: options.id,
            deviceId: options.deviceId,
            name: options.name,
            spark: {
              mnemonic: options.mnemonic,
            },
          })
          console.log(`Updated account ${options.id}`)
          return
        }

        await updateAccount({ evolu })({
          id: options.id,
          deviceId: options.deviceId,
          name: options.name,
          cashRegister: {
            currency: options.currency,
          },
        })
        console.log(`Updated account ${options.id}`)
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
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        await deleteAccount({ evolu })(options.id)
        console.log(`Deleted account ${options.id}`)
      },
    })
  )
