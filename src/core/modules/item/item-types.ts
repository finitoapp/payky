import { id } from "@evolu/common"
import { z } from "zod"

import { standardSchemaToZod } from "@/zod-utils.ts"

export const ItemIdRaw = id("Item")
export const ItemId = standardSchemaToZod(ItemIdRaw)
export type ItemId = typeof ItemIdRaw.Output

export const ItemLineTypeSchema = z.enum(["catalogItem", "manualAmount", "tip"])

export type ItemLineType = z.output<typeof ItemLineTypeSchema>
