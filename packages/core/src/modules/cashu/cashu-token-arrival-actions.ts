import type { MutationOptions } from "@evolu/common"
import type { Evolu } from "../../evolu/schema.ts"
import type { PaymentId } from "../payment/payment-types.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import type {
  CashuAmount,
  CashuTokenArrivalState,
  MintUrl,
} from "./cashu-types.ts"
import { cashuTokenArrivalIdFor } from "./cashu-utils.ts"

/**
 * What the wait screen shows of a token sent for a payment, in the local-only
 * `_cashuTokenArrival`: the payment's last token wins.
 */
export const upsertCashuTokenArrival = (
  evolu: Evolu,
  arrival: {
    readonly paymentId: PaymentId
    readonly mintUrl: MintUrl
    readonly amount: CashuAmount
    readonly fee: number | null
    readonly state: CashuTokenArrivalState
    readonly failure: string | null
  },
  options?: MutationOptions
): void => {
  evolu.upsert(
    "_cashuTokenArrival",
    {
      ...arrival,
      id: cashuTokenArrivalIdFor(arrival.paymentId),
      fee: arrival.fee === null ? null : NonNegativeInteger(arrival.fee),
    },
    options
  )
}
