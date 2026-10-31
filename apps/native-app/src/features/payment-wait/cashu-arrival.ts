import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { CashuReceiveError } from "@payky/core/modules/cashu/cashu-errors"
import type {
  CashuTokenArrivalState,
  MintUrl,
} from "@payky/core/modules/cashu/cashu-types"

/** A row of the local-only `_cashuTokenArrival`. */
export interface CashuTokenArrival {
  readonly mintUrl: MintUrl
  readonly amount: number
  readonly fee: number | null
  readonly state: CashuTokenArrivalState
  readonly failure: string | null
}

const failureKeys = {
  MintUnreachable: "paymentWait.cashu.failure.mintUnreachable",
  MintRejected: "paymentWait.cashu.failure.mintRejected",
  CashuMintUnsupported: "paymentWait.cashu.failure.unsupported",
  TokenLocked: "paymentWait.cashu.failure.locked",
  TokenUndecodable: "paymentWait.cashu.failure.undecodable",
  TokenAlreadyKnown: "paymentWait.cashu.failure.alreadyKnown",
  AmountConsumedByFee: "paymentWait.cashu.failure.fee",
  CounterLockTimeout: "paymentWait.cashu.failure.mintUnreachable",
  CashuReclaimAmbiguous: "paymentWait.cashu.failure.mintUnreachable",
  TokenPending: "paymentWait.cashu.failure.mintUnreachable",
} satisfies Record<CashuReceiveError["type"], TranslationKey>

/** The stored refusal's message; an unknown one reads as the mint's refusal. */
const failureKeyOf = (failure: string | null): TranslationKey =>
  failure !== null && Object.hasOwn(failureKeys, failure)
    ? failureKeys[failure as keyof typeof failureKeys]
    : "paymentWait.cashu.failure.mintRejected"

/**
 * What the wait screen says of a token sent for this payment (cashu/0006),
 * the same choice as web's `CashuTokenArrivalNote`. It is display only: the
 * payment's status still comes from the booked claims.
 */
export function cashuArrivalMessage(arrival: CashuTokenArrival): {
  readonly key: TranslationKey
  readonly params: Readonly<Record<string, string | number>>
} {
  const params = { amount: arrival.amount, mint: arrival.mintUrl }
  if (arrival.state === "untrustedMint")
    return { key: "paymentWait.cashu.arrival.untrustedMint", params }
  if (arrival.state === "failed")
    return { key: failureKeyOf(arrival.failure), params: {} }
  if (arrival.state === "waitingForMint")
    return { key: "paymentWait.cashu.arrival.waitingForMint", params }
  if (arrival.state === "receivingElsewhere")
    return { key: "paymentWait.cashu.arrival.receivingElsewhere", params }
  if (arrival.state === "checkingElsewhere")
    return { key: "paymentWait.cashu.arrival.checkingElsewhere", params }
  if (arrival.state === "receivedElsewhere")
    return { key: "paymentWait.cashu.arrival.receivedElsewhere", params }
  if (arrival.state === "contested")
    return { key: "paymentWait.cashu.arrival.contested", params }
  if (arrival.fee !== null && arrival.fee > 0)
    return {
      key: "paymentWait.cashu.arrival.withFee",
      params: { ...params, fee: arrival.fee },
    }
  return { key: "paymentWait.cashu.arrival.receiving", params }
}
