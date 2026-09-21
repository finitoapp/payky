/**
 * How the bitcoin tab's QR is shown once cashu is one of the ways to pay:
 * the bare NUT-18 request for cashu wallets, the mint's Lightning invoice for
 * Lightning wallets, and the BIP-321 uri carrying both — the default, since
 * a wallet that understands either rail settles it.
 */
export type BitcoinQrMode = "cashu" | "universal" | "lightning"

export const bitcoinQrModes: ReadonlyArray<BitcoinQrMode> = [
  "cashu",
  "universal",
  "lightning",
]

export const isBitcoinQrMode = (value: unknown): value is BitcoinQrMode =>
  bitcoinQrModes.some((mode) => mode === value)

export interface BitcoinQrPayloads {
  readonly cashu: string | null
  readonly universal: string | null
  readonly lightning: string | null
}

const present = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value !== ""

/**
 * One QR for every way the terminal accepts bitcoin.
 *
 * With more than one instruction prepared, the payload is a BIP-321
 * `bitcoin:` URI carrying each as a query parameter: a Lightning wallet reads
 * `lightning=` and pays the mint's invoice (the ecash lands in the cashu
 * wallet), a cashu wallet reads `creq=` and sends the ecash over Nostr, a
 * Spark wallet reads `spark=` and pays over Spark. Any of them settles the
 * payment. With one instruction only, the bare instruction is the payload —
 * every wallet scans that, and BIP-321 adds nothing.
 */
export const buildBitcoinPaymentUri = ({
  lightningInvoice,
  sparkInvoice,
  cashuRequest,
}: {
  readonly lightningInvoice: string | null
  readonly sparkInvoice: string | null
  readonly cashuRequest?: string | null
}): string | null => {
  const instructions: Array<readonly [key: string, value: string]> = []
  if (present(lightningInvoice)) {
    instructions.push(["lightning", lightningInvoice])
  }
  if (present(cashuRequest)) {
    instructions.push(["creq", cashuRequest])
  }
  if (present(sparkInvoice)) {
    instructions.push(["spark", sparkInvoice])
  }

  const [only] = instructions
  if (only === undefined) return null
  if (instructions.length === 1) return only[1]

  const query = instructions
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")
  return `bitcoin:?${query}`
}

/** The payload behind each {@link BitcoinQrMode}; `null` where nothing is prepared for it. */
export const buildBitcoinQrPayloads = ({
  lightningInvoice,
  sparkInvoice,
  cashuRequest,
}: {
  readonly lightningInvoice: string | null
  readonly sparkInvoice: string | null
  readonly cashuRequest: string | null
}): BitcoinQrPayloads => ({
  cashu: present(cashuRequest) ? cashuRequest : null,
  universal: buildBitcoinPaymentUri({
    lightningInvoice,
    sparkInvoice,
    cashuRequest,
  }),
  lightning: present(lightningInvoice) ? lightningInvoice : null,
})
