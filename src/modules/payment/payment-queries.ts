import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/evolu/schema.ts"
import type { PaymentId } from "./payment-types.ts"

export const paymentByIdQuery = (idValue: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .selectAll()
      .where("id", "=", idValue)
      .where("method", "is not", null)
      .where("status", "is not", null)
      .where("fiatAmount", "is not", null)
      .where("fiatCurrency", "is not", null)
      .where("tipAmount", "is not", null)
      .$narrowType<{
        method: KyselyNotNull
        status: KyselyNotNull
        fiatAmount: KyselyNotNull
        fiatCurrency: KyselyNotNull
        tipAmount: KyselyNotNull
      }>()
  )
