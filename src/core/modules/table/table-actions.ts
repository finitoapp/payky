import {
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type { Table, TableRow } from "./table.ts"
import { tablesQuery } from "./table-queries.ts"
import type { TableId } from "./table-types.ts"
import { generateTableCode } from "./table-utils.ts"

export const createTable =
  (
    input: InsertValues<Table>
  ): Task<TableId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const { id } = await runMutationWithCompletion((options) =>
      run.deps.evolu.insert("table", removeUndefinedValues(input), {
        ...options,
        ownerId: evoluOwnerId,
      })
    )
    return ok(id)
  }

/**
 * Creates a table appended after the current last one, deriving `sortOrder`
 * from the highest existing value and generating its `code` instead of
 * taking either as input. There is no reorder UI yet, so this is the only
 * way callers assign `sortOrder` when adding a new table.
 */
export const createTableAtEnd =
  (
    input: Omit<InsertValues<Table>, "sortOrder" | "code">
  ): Task<TableId, never, EvoluOwnerIdDep & EvoluDep> =>
  async (run) => {
    const existing = await run.deps.evolu.loadQuery(tablesQuery)
    const lastSortOrder = existing.at(-1)?.sortOrder ?? -1

    return ok(
      await run.ok(
        createTable({
          ...input,
          sortOrder: NonNegativeInteger(lastSortOrder + 1),
          code: generateTableCode(),
        })
      )
    )
  }

export const updateTable =
  (
    input: UpdateValues<Table>
  ): Task<TableId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update("table", removeUndefinedValues(input), {
        ...options,
        ownerId: evoluOwnerId,
      })
    )
    return ok(input.id)
  }

export const deleteTable =
  (id: TableId): Task<TableId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "table",
        { id, isDeleted: sqliteTrue },
        {
          ...options,
          ownerId: evoluOwnerId,
        }
      )
    )
    return ok(id)
  }

export const listTables =
  (): Task<ReadonlyArray<TableRow>, never, EvoluDep> => async (run) =>
    ok(await run.deps.evolu.loadQuery(tablesQuery))
