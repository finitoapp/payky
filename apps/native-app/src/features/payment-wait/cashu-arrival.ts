import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { CashuReceiveError } from "@payky/core/cashu/cashu-receive"
import type { CashuTokenArrival } from "@payky/core/cashu/cashu-token-listener"

const failureKeys = {
  MintUnreachable: "paymentWait.cashu.failure.mintUnreachable",
  MintRejected: "paymentWait.cashu.failure.mintRejected",
  TokenLocked: "paymentWait.cashu.failure.locked",
  TokenUndecodable: "paymentWait.cashu.failure.undecodable",
  TokenAlreadyKnown: "paymentWait.cashu.failure.alreadyKnown",
  AmountConsumedByFee: "paymentWait.cashu.failure.fee",
  ProofsSpent: "paymentWait.cashu.failure.spent",
  CounterLockTimeout: "paymentWait.cashu.failure.mintUnreachable",
} satisfies Record<CashuReceiveError["type"], TranslationKey>

/**
 * What the wait screen says of a token sent for this payment (cashu.md §4),
 * the same choice as web's `CashuTokenArrivalNote`. It is display only: the
 * payment's status still comes from the booked claims.
 */
export function cashuArrivalMessage(arrival: CashuTokenArrival): {
  readonly key: TranslationKey
  readonly params: Readonly<Record<string, string | number>>
} {
  const params = { amount: arrival.amount, mint: arrival.mint }
  if (arrival.state === "untrustedMint")
    return { key: "paymentWait.cashu.arrival.untrustedMint", params }
  if (arrival.state === "failed")
    return {
      key:
        arrival.failure === null
          ? "paymentWait.cashu.failure.mintRejected"
          : failureKeys[arrival.failure],
      params: {},
    }
  if (arrival.state === "waitingForMint")
    return { key: "paymentWait.cashu.arrival.waitingForMint", params }
  if (arrival.fee !== null && arrival.fee > 0)
    return {
      key: "paymentWait.cashu.arrival.withFee",
      params: { ...params, fee: arrival.fee },
    }
  return { key: "paymentWait.cashu.arrival.receiving", params }
}
