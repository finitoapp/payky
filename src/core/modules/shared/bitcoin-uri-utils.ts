import { btcToSats } from "@/core/modules/shared/money.ts"

export interface ScannedBitcoinAddress {
  readonly address: string
  readonly amountSats?: number
}

/**
 * Accepts either a bare address or a BIP21 `bitcoin:` URI (as produced by
 * most wallet "receive" QR codes) and extracts the address and, if present,
 * the requested amount.
 *
 * Separate from `bitcoin-address-utils.ts` on purpose: `schema.ts` imports
 * that file for its address refinement, so anything reaching back into
 * `money.ts` — as this does for `btcToSats` — would close a cycle through
 * `money.ts` -> `schema.ts`.
 */
export const parseScannedBitcoinAddress = (
  rawValue: string
): ScannedBitcoinAddress => {
  const trimmed = rawValue.trim()

  if (!trimmed.toLowerCase().startsWith("bitcoin:")) {
    return { address: trimmed }
  }

  try {
    const uri = new URL(trimmed)
    const amountParam = uri.searchParams.get("amount")
    const amountBtc = amountParam === null ? null : Number(amountParam)
    const amountSats =
      amountBtc !== null && Number.isFinite(amountBtc) && amountBtc > 0
        ? btcToSats(amountBtc)
        : undefined

    return { address: uri.pathname, amountSats }
  } catch {
    return { address: trimmed }
  }
}
