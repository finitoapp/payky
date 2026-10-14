/**
 * What the Cashu tab's one QR carries (cashu.md §4, decision 3): a BIP-321
 * `bitcoin:` URI with the mint's Lightning invoice and, from phase 4, a
 * NUT-18 payment request next to it. Both legs are rebuilt from stored data,
 * so the QR survives a restart without being stored.
 *
 * The builder and the leg pick match Linky's `buildBip321PaymentUri` and
 * `pickBip321PayableLeg` (`linkshu/src/paymentRequest/bip321.ts`); the
 * cross-app vectors pin them.
 */

const stripLightningPrefix = (value: string): string =>
  value
    .trim()
    .replace(/^lightning:/iu, "")
    .trim()

/**
 * `bitcoin:?lightning=<bolt11>&creq=<creqA…>`, leaving out empty legs; null
 * when both are empty. No on-chain address: Cashu has none.
 */
export const buildBip321PaymentUri = (legs: {
  readonly lightning?: string | null
  readonly creq?: string | null
}): string | null => {
  const params = new URLSearchParams()
  const lightning = (legs.lightning ?? "").trim()
  const creq = (legs.creq ?? "").trim()
  if (lightning !== "") params.set("lightning", stripLightningPrefix(lightning))
  if (creq !== "") params.set("creq", creq)
  const query = params.toString()
  return query === "" ? null : `bitcoin:?${query}`
}

export type Bip321PayableLeg =
  | { readonly kind: "cashu-request"; readonly value: string }
  | { readonly kind: "lightning"; readonly value: string }

/**
 * The leg a Cashu wallet like Linky pays: the NUT-18 request first, then the
 * Lightning invoice. Null for anything else (Linky's LNURL and Lightning
 * address legs never appear in Payky's QR).
 */
export const pickBip321PayableLeg = (uri: string): Bip321PayableLeg | null => {
  const value = uri.trim()
  if (!/^bitcoin:/iu.test(value)) return null
  const body = value.slice("bitcoin:".length)
  const query = body.includes("?") ? body.slice(body.indexOf("?") + 1) : ""
  const params = new URLSearchParams(query)
  const creq = params.get("creq")?.trim() ?? ""
  if (/^creqA/iu.test(creq)) return { kind: "cashu-request", value: creq }
  const lightning = stripLightningPrefix(params.get("lightning") ?? "")
  if (/^(lnbc|lntb|lnbcrt)/iu.test(lightning))
    return { kind: "lightning", value: lightning }
  return null
}
