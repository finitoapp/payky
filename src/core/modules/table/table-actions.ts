import type { InsertValues } from "@evolu/common"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { removeUndefinedValues } from "@/core/modules/shared/utils.ts"
import type { TableRow, table } from "./table.ts"
import { tablesQuery } from "./table-queries.ts"
import type { TableId } from "./table-types.ts"

type CreateTableInput = InsertValues<typeof table>

export const createTable =
  (deps: EvoluDep) =>
  async (input: CreateTableInput): Promise<TableId> => {
    const { id } = deps.evolu.insert("table", removeUndefinedValues(input))
    return id
  }

export const listTables =
  (deps: EvoluDep) => async (): Promise<ReadonlyArray<TableRow>> =>
    deps.evolu.loadQuery(tablesQuery)
