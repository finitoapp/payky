import { roundCashAmount } from "@payky/core/modules/payment/payment-cash-utils"
import { NonNegativeInteger } from "@payky/core/modules/shared/schema"

// This runs in the native screen too, so a broken import or runtime fails visibly.
export function checkSharedLogic() {
  const rounded = roundCashAmount({
    amount: NonNegativeInteger(12345),
    currency: "CZK",
  })
  if (rounded !== 12300) {
    throw new Error("Shared CZK cash rounding check failed")
  }
  return rounded
}
