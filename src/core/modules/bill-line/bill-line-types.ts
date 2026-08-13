import { type Brand, type Id, id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const BillLineIdRaw = id("BillLine")
export const BillLineId = standardSchemaToZod(BillLineIdRaw)
export type BillLineId = typeof BillLineIdRaw.Type

/**
 * `BillLineSummary` rows are computed in memory (never written to an Evolu
 * table), so their id is a plain `createIdFromString` brand rather than a
 * `id("...")`-declared table id.
 */
export type BillLineSummaryId = Id & Brand<"BillLineSummary">
