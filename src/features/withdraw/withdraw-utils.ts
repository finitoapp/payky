export interface ScannedBitcoinAddress {
  readonly address: string
  readonly amountSats?: number
}

/**
 * Accepts either a bare address or a BIP21 `bitcoin:` URI (as produced by
 * most wallet "receive" QR codes) and extracts the address and, if present,
 * the requested amount.
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
        ? Math.round(amountBtc * 100_000_000)
        : undefined

    return { address: uri.pathname, amountSats }
  } catch {
    return { address: trimmed }
  }
}

export const formatSatsAmount = (sats: number, locale: string): string =>
  new Intl.NumberFormat(locale).format(sats)
