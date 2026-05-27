import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { PaymentId } from "./payment-types.ts"

export const paymentByIdQuery = (idValue: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .selectAll()
      .where("id", "=", idValue)
      .where("amount", "is not", null)
      .where("currency", "is not", null)
      .where("tipAmount", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
      }>()
  )
