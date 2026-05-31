import { ok, type Task } from "@evolu/common"
import { type Command, createCommand } from "commander"
import { zodCommand } from "zod-commander/zod4"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { DeviceId } from "../src/core/modules/device/device-types"
import {
  NonEmptyString255Schema,
  NonNegativeIntegerFromStringSchema,
} from "../src/core/modules/shared/schema"
import { removeUndefinedValues } from "../src/core/modules/shared/utils"
import {
  createTable,
  deleteTable,
  updateTable,
} from "../src/core/modules/table/table-actions"
import {
  tableByIdQuery,
  tablesQuery,
} from "../src/core/modules/table/table-queries"
import { TableId } from "../src/core/modules/table/table-types"

export const registerTablesCommand =
  (program: Command): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  (run) => {
    const { evolu } = run.deps

    const tablesCommand = createCommand("tables").description(
      "Manage restaurant tables."
    )

    tablesCommand

      .addCommand(
        zodCommand({
          name: "list",
          description: "List active tables.",
          args: {},
          opts: {},
          async action() {
            run.deps.console.table(await evolu.loadQuery(tablesQuery))
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "get",
          description: "Show one table by id.",
          args: {},
          opts: {
            id: TableId.describe("Table id"),
          },
          async action(_, options) {
            run.deps.console.table(
              await evolu.loadQuery(tableByIdQuery(options.id))
            )
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "create",
          description: "Create a table.",
          args: {},
          opts: {
            name: NonEmptyString255Schema.describe("n;Table name"),
            sortOrder:
              NonNegativeIntegerFromStringSchema.describe("s;Sort order"),
            deviceId: DeviceId.optional().describe(
              "Device id that created the table"
            ),
          },
          async action(_, options) {
            const data = {
              deviceId: options.deviceId ?? null,
              name: options.name,
              sortOrder: options.sortOrder,
            }

            const id = await run.orThrow(createTable(data))
            run.deps.console.log(
              `Inserted table ${id}: ${JSON.stringify({ id, ...data })}`
            )
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "update",
          description: "Update a table.",
          args: {},
          opts: {
            id: TableId.describe("Table id"),
            name: NonEmptyString255Schema.optional().describe("n;Table name"),
            sortOrder:
              NonNegativeIntegerFromStringSchema.optional().describe(
                "s;Sort order"
              ),
            deviceId: DeviceId.optional().describe(
              "Device id that updated the table"
            ),
          },
          async action(_, options) {
            await run.orThrow(updateTable(removeUndefinedValues(options)))
            run.deps.console.log(`Updated table ${options.id}`)
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "delete",
          description: "Soft delete a table.",
          args: {},
          opts: {
            id: TableId.describe("Table id"),
          },
          async action(_, options) {
            await run.orThrow(deleteTable(options.id))
            run.deps.console.log(`Deleted table ${options.id}`)
          },
        })
      )

    program.addCommand(tablesCommand)
    return ok(undefined)
  }
