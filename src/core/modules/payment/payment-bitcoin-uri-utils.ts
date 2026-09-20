/**
 * One QR for every way the terminal accepts bitcoin.
 *
 * With both a Lightning invoice and a Spark invoice prepared, the payload is
 * a BIP-321 `bitcoin:` URI carrying both as query parameters: a Lightning
 * wallet reads `lightning=` and pays the mint's invoice (the ecash lands in
 * the cashu wallet), a Spark wallet reads `spark=` and pays over Spark. Either
 * settles the payment. With one instruction only, the bare invoice is the
 * payload — every wallet scans that, and BIP-321 adds nothing.
 */
export const buildBitcoinPaymentUri = ({
  lightningInvoice,
  sparkInvoice,
}: {
  readonly lightningInvoice: string | null
  readonly sparkInvoice: string | null
}): string | null => {
  const instructions: Array<readonly [key: string, value: string]> = []
  if (lightningInvoice !== null && lightningInvoice !== "") {
    instructions.push(["lightning", lightningInvoice])
  }
  if (sparkInvoice !== null && sparkInvoice !== "") {
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
