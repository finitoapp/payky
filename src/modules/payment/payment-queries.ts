import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/evolu/schema.ts"
import type { PaymentId } from "./payment-types.ts"

export const paymentByIdQuery = (idValue: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .selectAll()
      .where("id", "=", idValue)
      .where("status", "is not", null)
      .where("amount", "is not", null)
      .where("currency", "is not", null)
      .where("tipAmount", "is not", null)
      .$narrowType<{
        status: KyselyNotNull
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
      }>()
  )
