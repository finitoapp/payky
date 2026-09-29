import { id } from "@evolu/common"
import { z } from "zod"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const RefundIdRaw = id("Refund")
export const RefundId = standardSchemaToZod(RefundIdRaw)
export type RefundId = typeof RefundIdRaw.Output

export const RefundLineIdRaw = id("RefundLine")
export const RefundLineId = standardSchemaToZod(RefundLineIdRaw)
export type RefundLineId = typeof RefundLineIdRaw.Output

export const RefundMethodSchema = z.enum(["cashRegister", "outside"])
export type RefundMethod = z.output<typeof RefundMethodSchema>

export type RefundState = "none" | "partial" | "full"
