import {
  evoluJsonArrayFrom,
  type SqliteBoolean,
  sqliteFalse,
  sqliteTrue,
} from "@evolu/common"
import { createRun } from "@evolu/nodejs"
import { createCommand } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"

import { createEvoluCli } from "../src/core/evolu/cli-client"
import { createQuery } from "../src/core/evolu/schema"
import { AccountId } from "../src/core/modules/account/account-types"
import {
  createFioPlugin,
  deleteFioPlugin,
  loadFioPlugin,
  updateFioPlugin,
} from "../src/core/modules/fio-plugin/fio-plugin-actions"
import { FioPluginId } from "../src/core/modules/fio-plugin/fio-plugin-types"
import {
  HttpsUrlSchema,
  NonEmptyString255Schema,
  PositiveIntegerFromStringSchema,
} from "../src/core/modules/shared/schema"

declare const process: {
  exitCode?: number
}

const SqliteBooleanFromStringSchema = z
  .enum(["true", "false", "1", "0"])
  .transform(
    (value): SqliteBoolean =>
      value === "true" || value === "1" ? sqliteTrue : sqliteFalse
  )

const fioPluginsWithTokensQuery = createQuery((db) =>
  db
    .selectFrom("fioPlugin")
    .select((eb) => [
      "fioPlugin.id",
      "fioPlugin.accountId",
      "fioPlugin.apiUrl",
      "fioPlugin.numberOfSecondsBetweenChecks",
      "fioPlugin.isActive",
      evoluJsonArrayFrom(
        eb
          .selectFrom("fioPluginToken")
          .select(["fioPluginToken.id", "fioPluginToken.token"])
          .whereRef("fioPluginToken.fioPluginId", "=", "fioPlugin.id")
          .where("fioPluginToken.token", "is not", null)
          .where("fioPluginToken.isDeleted", "is", null)
          .orderBy("fioPluginToken.createdAt")
      ).as("tokens"),
    ])
    .where("fioPlugin.accountId", "is not", null)
    .where("fioPlugin.apiUrl", "is not", null)
    .where("fioPlugin.numberOfSecondsBetweenChecks", "is not", null)
    .where("fioPlugin.isActive", "is not", null)
    .where("fioPlugin.isDeleted", "is", null)
    .orderBy("fioPlugin.createdAt", "desc")
)

const fioPluginWithTokensByIdQuery = (id: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPlugin")
      .select((eb) => [
        "fioPlugin.id",
        "fioPlugin.accountId",
        "fioPlugin.apiUrl",
        "fioPlugin.numberOfSecondsBetweenChecks",
        "fioPlugin.isActive",
        "fioPlugin.isDeleted",
        evoluJsonArrayFrom(
          eb
            .selectFrom("fioPluginToken")
            .select([
              "fioPluginToken.id",
              "fioPluginToken.token",
              "fioPluginToken.isDeleted",
            ])
            .whereRef("fioPluginToken.fioPluginId", "=", "fioPlugin.id")
            .orderBy("fioPluginToken.createdAt")
        ).as("tokens"),
      ])
      .where("fioPlugin.id", "=", id)
  )

const printActionError = (
  error:
    | { readonly type: "AbortError" }
    | {
        readonly type: "NotFound"
        readonly entity: string
        readonly id: string
      }
    | {
        readonly type: "InvalidOperation"
        readonly message: string
      }
): void => {
  if (error.type === "AbortError") return

  console.error(
    error.type === "NotFound"
      ? `${error.entity} not found: ${error.id}`
      : error.message
  )
  process.exitCode = 1
}

export const fioPluginsCommand = createCommand("fio-plugins").description(
  "Manage FIO API plugin settings."
)

fioPluginsCommand

  .addCommand(
    zodCommand({
      name: "list",
      description: "List active FIO plugin configurations.",
      args: {},
      opts: {},
      async action() {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.log(
          JSON.stringify(
            await evolu.loadQuery(fioPluginsWithTokensQuery),
            null,
            2
          )
        )
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "get",
      description: "Show one FIO plugin configuration by id.",
      args: {},
      opts: {
        id: FioPluginId.describe("FIO plugin id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.log(
          JSON.stringify(
            await evolu.loadQuery(fioPluginWithTokensByIdQuery(options.id)),
            null,
            2
          )
        )
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "create",
      description: "Create a FIO plugin configuration.",
      args: {},
      opts: {
        accountId: AccountId.describe("a;IBAN account id"),
        apiUrl: HttpsUrlSchema.describe("u;FIO API base URL"),
        numberOfSecondsBetweenChecks: PositiveIntegerFromStringSchema.describe(
          "i;Polling interval seconds"
        ),
        isActive: SqliteBooleanFromStringSchema.describe(
          "x;Whether background sync is active"
        ),
        token: NonEmptyString255Schema.describe("t;FIO API token"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const result = await run(
          createFioPlugin({
            accountId: options.accountId,
            apiUrl: options.apiUrl,
            numberOfSecondsBetweenChecks: options.numberOfSecondsBetweenChecks,
            isActive: options.isActive,
            token: options.token,
          })
        )

        if (!result.ok) {
          printActionError(result.error)
          return
        }

        console.log(`Inserted FIO plugin ${result.value}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "update",
      description: "Update a FIO plugin configuration.",
      args: {},
      opts: {
        id: FioPluginId.describe("FIO plugin id"),
        accountId: AccountId.optional().describe("a;IBAN account id"),
        apiUrl: HttpsUrlSchema.optional().describe("u;FIO API base URL"),
        numberOfSecondsBetweenChecks:
          PositiveIntegerFromStringSchema.optional().describe(
            "i;Polling interval seconds"
          ),
        isActive: SqliteBooleanFromStringSchema.optional().describe(
          "x;Whether background sync is active"
        ),
        token: NonEmptyString255Schema.optional().describe("t;FIO API token"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const pluginResult = await run(loadFioPlugin(options.id))
        if (!pluginResult.ok) {
          printActionError(pluginResult.error)
          return
        }

        const result = await run(
          updateFioPlugin({
            id: options.id,
            accountId: options.accountId,
            apiUrl: options.apiUrl,
            numberOfSecondsBetweenChecks: options.numberOfSecondsBetweenChecks,
            isActive: options.isActive,
            token: options.token,
          })
        )

        if (!result.ok) {
          printActionError(result.error)
          return
        }

        console.log(`Updated FIO plugin ${result.value}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "delete",
      description: "Soft delete a FIO plugin configuration.",
      args: {},
      opts: {
        id: FioPluginId.describe("FIO plugin id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const result = await run(deleteFioPlugin(options.id))
        if (!result.ok) {
          printActionError(result.error)
          return
        }

        console.log(`Deleted FIO plugin ${result.value}`)
      },
    })
  )
