import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const TableIdRaw = id("Table")
export const TableId = standardSchemaToZod(TableIdRaw)
export type TableId = typeof TableIdRaw.Type
