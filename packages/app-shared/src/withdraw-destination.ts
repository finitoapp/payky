import {
  parseWithdrawDestination,
  type WithdrawDestination,
} from "@payky/core/modules/withdraw/withdraw-destination-utils"
import type { TranslationKey } from "./i18n/resources.ts"
import { destinationErrorKeys, type WithdrawMethod } from "./withdraw-flow.ts"

export const destinationKindKeys = {
  onchain: "withdraw.destination.kind.onchain",
  "lightning-invoice": "withdraw.destination.kind.lightningInvoice",
  "lightning-address": "withdraw.destination.kind.lightningAddress",
  unsupported: "withdraw.destination.invalid",
} satisfies Record<WithdrawDestination["kind"], TranslationKey>

const unsupportedKeys = {
  spark: "withdraw.error.sparkDestinationNotSupported",
  lnurl: "withdraw.error.lnurlNotSupported",
} satisfies Record<
  Extract<WithdrawDestination, { kind: "unsupported" }>["reason"],
  TranslationKey
>

/**
 * Why `method` cannot pay a destination that parsed, or `null` when it can:
 * a Cashu melt pays only a Lightning invoice that carries its amount.
 */
const unpayableKey = (
  destination: WithdrawDestination,
  method: WithdrawMethod
): TranslationKey | null => {
  if (destination.kind === "unsupported") {
    return unsupportedKeys[destination.reason]
  }
  if (method === "spark") return null
  if (destination.kind === "onchain") return "withdraw.cashu.error.onchain"
  return destination.kind === "lightning-invoice" &&
    destination.amountSats === null
    ? "withdraw.cashu.error.amountlessInvoice"
    : null
}

/** What the destination field says under itself while the merchant types. */
export const describeDestination = (
  raw: string,
  parsed: ReturnType<typeof parseWithdrawDestination>,
  method: WithdrawMethod
): {
  readonly hint: TranslationKey | null
  readonly error: TranslationKey | null
} => {
  if (raw.trim() === "") return { hint: null, error: null }
  if (!parsed.ok) {
    // An address half typed is not an error yet; a wrong network stays one.
    return parsed.error.type === "LightningInvoiceWrongNetwork"
      ? { hint: null, error: destinationErrorKeys[parsed.error.type] }
      : { hint: null, error: null }
  }
  const unpayable = unpayableKey(parsed.value, method)
  return unpayable === null
    ? { hint: destinationKindKeys[parsed.value.kind], error: null }
    : { hint: null, error: unpayable }
}

export const isPayableDestination = (
  raw: string,
  method: WithdrawMethod
): boolean => {
  const parsed = parseWithdrawDestination(raw)
  return parsed.ok && unpayableKey(parsed.value, method) === null
}
