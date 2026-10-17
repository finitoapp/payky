import { BillId } from "@payky/core/modules/bill/bill-types"
import {
  FiatCurrencySchema,
  NonNegativeInteger,
} from "@payky/core/modules/shared/schema"
import { z } from "zod"

// Mirrors web's `PaymentTipSearchSchema`: every field falls back instead of
// throwing, so a stale link shows "invalid link" rather than the error
// screen; a broken `billId` only loses the bill link.
const tipSearchSchema = z.object({
  amount: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional()
    .catch(undefined),
  currency: FiatCurrencySchema.optional().catch(undefined),
  billId: BillId.optional().catch(undefined),
})

/** `null` when there is no amount or currency to tip on. */
export const parseTipSearch = (params: Readonly<Record<string, unknown>>) => {
  const { amount, currency, billId } = tipSearchSchema.parse({
    amount: params.amount,
    currency: params.currency,
    billId: params.billId,
  })
  return amount === undefined || currency === undefined
    ? null
    : {
        amount: NonNegativeInteger(amount),
        currency,
        billId: billId ?? null,
      }
}
