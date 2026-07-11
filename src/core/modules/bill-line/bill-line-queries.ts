import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"

export const billLinesByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("billLine")
      .selectAll()
      .where("billId", "=", billId)
      .where("billId", "is not", null)
      .where("itemId", "is not", null)
      .where("type", "is not", null)
      .where("kind", "is not", null)
      .where("quantity", "is not", null)
      .where("totalAmount", "is not", null)
      .$narrowType<{
        billId: KyselyNotNull
        itemId: KyselyNotNull
        type: KyselyNotNull
        kind: KyselyNotNull
        quantity: KyselyNotNull
        totalAmount: KyselyNotNull
      }>()
      .orderBy("createdAt", "asc")
  )
