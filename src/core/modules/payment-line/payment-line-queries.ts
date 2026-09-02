import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"

/**
 * The bill-line snapshot frozen for a payment at the moment it was created
 * (see `snapshotBillLinesForPayment` in `payment-line-actions.ts`). Empty
 * for a payment created before this snapshot existed, or one with no bill —
 * callers should treat an empty result as "no snapshot available", not "the
 * bill was empty". See docs/bill-payment-states.md.
 */
export const paymentLinesByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("paymentLine")
      .selectAll()
      .where("paymentId", "=", paymentId)
      .where("isDeleted", "is not", 1)
      .where("billId", "is not", null)
      .where("itemId", "is not", null)
      .where("type", "is not", null)
      .where("quantity", "is not", null)
      .where("totalAmount", "is not", null)
      .$narrowType<{
        billId: KyselyNotNull
        itemId: KyselyNotNull
        type: KyselyNotNull
        quantity: KyselyNotNull
        totalAmount: KyselyNotNull
      }>()
  )
