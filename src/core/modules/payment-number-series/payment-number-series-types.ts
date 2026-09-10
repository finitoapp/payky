import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

const PaymentNumberSeriesIdRaw = id("PaymentNumberSeries")
export const PaymentNumberSeriesId = standardSchemaToZod(
  PaymentNumberSeriesIdRaw
)
export type PaymentNumberSeriesId = typeof PaymentNumberSeriesIdRaw.Output
