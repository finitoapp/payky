import { createId, createRandomBytes, id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const BillIdRaw = id("Bill")
export const BillId = standardSchemaToZod(BillIdRaw)
export type BillId = typeof BillIdRaw.Output

/**
 * A fresh, client-generated `BillId` that hasn't been written to Evolu yet —
 * used to put a new cart's id in the `/bill` URL immediately, before its bill
 * row is lazily created on the first added line (see `use-cart-bill.ts`'s
 * `ensureBillExists`).
 */
export const createRandomBillId = (): BillId =>
  createId({ randomBytes: createRandomBytes() }) as BillId
