import { createIdFromString } from "@evolu/common"

import type { BillItemType } from "@/core/modules/shared/schema.ts"
import type { BillItemRow } from "./bill-item.ts"
import type { BillItemId } from "./bill-item-types.ts"

export interface BillItemIdentityInput {
  readonly billId: BillItemRow["billId"]
  readonly catalogItemId: BillItemRow["catalogItemId"]
  readonly itemId: BillItemRow["itemId"]
  readonly type: BillItemType
}

export const createBillItemId = (input: BillItemIdentityInput): BillItemId =>
  createIdFromString<"BillItem">(
    JSON.stringify({
      billId: input.billId,
      catalogItemId: input.catalogItemId,
      itemId: input.itemId,
      type: input.type,
    })
  )
