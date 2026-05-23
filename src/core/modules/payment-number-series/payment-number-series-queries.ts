import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import { paymentNumberSeriesId } from "./payment-number-series-utils.ts"

export const paymentNumberSeriesQuery = createQuery((db) =>
  db
    .selectFrom("paymentNumberSeries")
    .selectAll()
    .where("id", "=", paymentNumberSeriesId)
    .where("serialNumberDigits", "is not", null)
    .where("yearFormat", "is not", null)
    .where("monthFormat", "is not", null)
    .where("dayFormat", "is not", null)
    .$narrowType<{
      serialNumberDigits: KyselyNotNull
      yearFormat: KyselyNotNull
      monthFormat: KyselyNotNull
      dayFormat: KyselyNotNull
    }>()
)
