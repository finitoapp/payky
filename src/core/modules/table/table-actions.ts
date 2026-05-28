import { type InsertValues, ok, type Task } from "@evolu/common"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { removeUndefinedValues } from "@/core/modules/shared/utils.ts"
import type { TableRow, table } from "./table.ts"
import { tablesQuery } from "./table-queries.ts"
import type { TableId } from "./table-types.ts"

export const createTable =
  (input: InsertValues<typeof table>): Task<TableId, never, EvoluDep> =>
  async (run) => {
    const { id } = run.deps.evolu.insert("table", removeUndefinedValues(input))
    return ok(id)
  }

export const listTables =
  (): Task<ReadonlyArray<TableRow>, never, EvoluDep> => async (run) =>
    ok(await run.deps.evolu.loadQuery(tablesQuery))
