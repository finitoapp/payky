import { decimalAmountToMinorUnits } from "@/core/modules/shared/money.ts"

export interface ScannedBitcoinAddress {
  readonly address: string
  readonly amountSats?: number
  /** A BIP21 `lightning=` invoice the payer may pay instead of the address. */
  readonly lightning?: string
}

// BIP21's `amount` is decimal BTC with a dot: no exponent, no comma.
const BIP21_AMOUNT = /^\d+(?:\.\d+)?$/u

/**
 * Bech32 is case-insensitive and QR codes carry it upper-case to fit their
 * alphanumeric mode; base58 is case-sensitive. So only an all-upper-case
 * `BC1…` is lowered — a mixed-case one stays as it is, for validation to refuse.
 */
export const normalizeBitcoinAddress = (address: string): string =>
  /^bc1/iu.test(address) && address === address.toUpperCase()
    ? address.toLowerCase()
    : address

/**
 * Accepts either a bare address or a BIP21 `bitcoin:` URI (as produced by
 * most wallet "receive" QR codes) and extracts the address, the requested
 * amount and a `lightning=` invoice, if present. `null` for a URI that must
 * not be honored: one that does not parse, has an `amount` that is not exact
 * whole sats, or a `req-` parameter, which BIP21 makes mandatory to
 * understand — and this app understands none.
 *
 * Separate from `bitcoin-address-utils.ts` on purpose: `schema.ts` imports
 * that file for its address refinement, so anything reaching back into
 * `money.ts` — as this does for `decimalAmountToMinorUnits` — would close a
 * cycle through `money.ts` -> `schema.ts`.
 */
export const parseScannedBitcoinAddress = (
  rawValue: string
): ScannedBitcoinAddress | null => {
  const trimmed = rawValue.trim()

  if (!trimmed.toLowerCase().startsWith("bitcoin:")) {
    return { address: normalizeBitcoinAddress(trimmed) }
  }
  if (!URL.canParse(trimmed)) return null

  const uri = new URL(trimmed)
  const params = uri.searchParams
  if ([...params.keys()].some((key) => key.startsWith("req-"))) return null

  const amountParam = params.get("amount")
  let amountSats: number | undefined
  if (amountParam !== null) {
    const sats = BIP21_AMOUNT.test(amountParam)
      ? decimalAmountToMinorUnits({ currency: "BTC", value: amountParam })
      : null
    if (sats === null) return null
    amountSats = sats
  }

  return {
    address: normalizeBitcoinAddress(uri.pathname),
    amountSats,
    lightning: params.get("lightning") ?? undefined,
  }
}
