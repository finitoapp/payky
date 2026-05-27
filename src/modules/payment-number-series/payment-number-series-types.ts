import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const PaymentNumberSeriesIdRaw = id("PaymentNumberSeries")
export const PaymentNumberSeriesId = standardSchemaToZod(
  PaymentNumberSeriesIdRaw
)
export type PaymentNumberSeriesId = typeof PaymentNumberSeriesIdRaw.Type
