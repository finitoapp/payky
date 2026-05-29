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

import { createFetchDep } from "../src/core/deps"
import { createEvoluCli } from "../src/core/evolu/cli-client"
import { createQuery } from "../src/core/evolu/schema"
import {
  createFioApiDep,
  setFioLastDate,
} from "../src/core/integrations/fio/fio-client"
import { AccountId } from "../src/core/modules/account/account-types"
import {
  createFioPlugin,
  deleteFioPlugin,
  loadFioPlugin,
  updateFioPlugin,
} from "../src/core/modules/fio-plugin/fio-plugin-actions"
import { fioPluginTokensByPluginIdQuery } from "../src/core/modules/fio-plugin/fio-plugin-queries"
import { FioPluginId } from "../src/core/modules/fio-plugin/fio-plugin-types"
import {
  DateStringSchema,
  NonEmptyString255Schema,
  PositiveIntegerFromStringSchema,
} from "../src/core/modules/shared/schema"

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

        const fioPluginId = await run.orThrow(
          createFioPlugin({
            accountId: options.accountId,
            numberOfSecondsBetweenChecks: options.numberOfSecondsBetweenChecks,
            isActive: options.isActive,
            token: options.token,
          })
        )

        console.log(`Inserted FIO plugin ${fioPluginId}`)
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

        await run.orThrow(loadFioPlugin(options.id))

        const fioPluginId = await run.orThrow(
          updateFioPlugin({
            id: options.id,
            accountId: options.accountId,
            numberOfSecondsBetweenChecks: options.numberOfSecondsBetweenChecks,
            isActive: options.isActive,
            token: options.token,
          })
        )

        console.log(`Updated FIO plugin ${fioPluginId}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "set-cursor",
      description: "Set the FIO API last transaction cursor date.",
      args: {},
      opts: {
        id: FioPluginId.describe("FIO plugin id"),
        date: DateStringSchema.describe("Cursor date in YYYY-MM-DD format"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const evoluRun = createRun({ evolu })

        await evoluRun.orThrow(loadFioPlugin(options.id))
        const tokens = await evolu.loadQuery(
          fioPluginTokensByPluginIdQuery(options.id)
        )
        const firstToken = tokens[0]
        if (firstToken == null) {
          throw new Error(`FIO plugin ${options.id} has no active token.`)
        }

        const fioRun = createRun({
          ...createFetchDep(),
          ...createFioApiDep({
            tokens: [
              firstToken.token,
              ...tokens.slice(1).map((row) => row.token),
            ],
          }),
        })
        console.log("ok")
        await fioRun.orThrow(setFioLastDate({ date: options.date }))
        console.log("ok2")

        console.log(
          `Set FIO cursor for plugin ${options.id} to ${options.date}`
        )
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

        const fioPluginId = await run.orThrow(deleteFioPlugin(options.id))

        console.log(`Deleted FIO plugin ${fioPluginId}`)
      },
    })
  )
