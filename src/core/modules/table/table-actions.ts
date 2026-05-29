import {
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type { Table, TableRow } from "./table.ts"
import { tablesQuery } from "./table-queries.ts"
import type { TableId } from "./table-types.ts"

export const createTable =
  (input: InsertValues<Table>): Task<TableId, never, EvoluDep> =>
  async (run) => {
    const { id } = await runMutationWithCompletion((options) =>
      run.deps.evolu.insert("table", removeUndefinedValues(input), options)
    )
    return ok(id)
  }

export const updateTable =
  (input: UpdateValues<Table>): Task<TableId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update("table", removeUndefinedValues(input), options)
    )
    return ok(input.id)
  }

export const deleteTable =
  (id: TableId): Task<TableId, never, EvoluDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update("table", { id, isDeleted: sqliteTrue }, options)
    )
    return ok(id)
  }

export const listTables =
  (): Task<ReadonlyArray<TableRow>, never, EvoluDep> => async (run) =>
    ok(await run.deps.evolu.loadQuery(tablesQuery))
