import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"

export const paymentNumbersByNewestQuery = createQuery((db) =>
  db
    .selectFrom("paymentNumber")
    .selectAll()
    .where("serialNumber", "is not", null)
    .where("date", "is not", null)
    .orderBy("date", "desc")
    .orderBy("serialNumber", "desc")
    .$narrowType<{
      serialNumber: KyselyNotNull
      date: KyselyNotNull
    }>()
)

export const paymentNumberByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("paymentNumber")
      .selectAll()
      .where("id", "=", paymentId)
      .where("serialNumber", "is not", null)
      .where("date", "is not", null)
      .$narrowType<{
        serialNumber: KyselyNotNull
        date: KyselyNotNull
      }>()
  )
