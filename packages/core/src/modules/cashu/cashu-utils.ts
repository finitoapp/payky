import { createIdFromString } from "@evolu/common"
import { base64urlnopad } from "@scure/base"
import { z } from "zod"
import { jsonCodec } from "../../zod-utils.ts"
import type { PaymentId } from "../payment/payment-types.ts"
import {
  type CashuCounterId,
  type CashuMintCacheId,
  type CashuMintTrustId,
  type CashuMoveId,
  type CashuOperationId,
  type CashuProofId,
  type CashuQuoteId,
  type CashuTokenArrivalId,
  type CashuTokenArrivalState,
  type CashuTokenText,
  CashuTokenTextSchema,
  type KeysetId,
  MintUrl,
  MintUrlSchema,
} from "./cashu-types.ts"

/**
 * A mint's one spelling: trimmed, no trailing slash, no search or hash, and
 * any `mint.minibits.cash` URL forced to `/Bitcoin`, as Linky spells it, so a
 * token from Linky names the mint the way the wallet does. Null when the
 * result is not an http(s) URL with a host.
 */
export const normalizeMintUrl = (value: string): MintUrl | null => {
  const raw = value.trim()
  if (raw === "") return null
  const stripped = raw.replace(/\/+$/u, "")

  const normalized = (() => {
    try {
      const url = new URL(stripped)
      if (url.host.toLowerCase() === "mint.minibits.cash")
        return "https://mint.minibits.cash/Bitcoin"
      const pathname = url.pathname.replace(/\/+$/u, "")
      return `${url.origin}${pathname}`.replace(/\/+$/u, "")
    } catch {
      return stripped
    }
  })()

  const parsed = MintUrlSchema.safeParse(normalized.trim().replace(/\/+$/u, ""))
  return parsed.success ? parsed.data : null
}

/**
 * Every id below derives from what the row is about, so devices agree on it.
 * An attempt is the exception: each device writes a row of its own
 * (cashu/0029).
 */
export const cashuProofIdFor = (secret: string): CashuProofId =>
  createIdFromString<"CashuProof">(secret)

export const cashuTopupOperationIdFor = (
  mint: MintUrl,
  quoteId: CashuQuoteId
): CashuOperationId =>
  createIdFromString<"CashuOperation">(`topup|${mint}|${quoteId}`)

/** Whoever swaps the token, the payment holding this id recognises it. */
export const cashuReceiveOperationIdFor = (
  tokenText: CashuTokenText
): CashuOperationId =>
  createIdFromString<"CashuOperation">(`receive|${tokenText}`)

export const cashuMeltOperationIdFor = (
  mint: MintUrl,
  quoteId: CashuQuoteId
): CashuOperationId =>
  createIdFromString<"CashuOperation">(`melt|${mint}|${quoteId}`)

export const cashuMoveIdFor = (
  topupOperationId: CashuOperationId
): CashuMoveId => createIdFromString<"CashuMove">(`move|${topupOperationId}`)

/** The one row of the account's trusted mints (cashu/0013). */
export const cashuMintTrustId: CashuMintTrustId =
  createIdFromString<"CashuMintTrust">("mint-trust")

export const cashuCounterIdFor = (
  mint: MintUrl,
  keysetId: KeysetId
): CashuCounterId =>
  createIdFromString<"CashuCounter">(`counter|${mint}|sat|${keysetId}`)

export const cashuMintCacheIdFor = (mint: MintUrl): CashuMintCacheId =>
  createIdFromString<"CashuMintCache">(`mint-cache|${mint}`)

export const cashuTokenArrivalIdFor = (
  paymentId: PaymentId
): CashuTokenArrivalId =>
  createIdFromString<"CashuTokenArrival">(`token-arrival|${paymentId}`)

/**
 * Per arrival, whether the wait screen keeps the payment's QR beside what it
 * says (cashu/0020). An arrival that leaves the payment unpaid keeps it, so
 * the customer can still pay another way: a token from a mint not trusted
 * (received only once the merchant trusts its mint), one spent elsewhere for
 * good, one whose block was contested (cashu/0029), one refused for good.
 * One that has paid the
 * payment, or may still pay it on its own, replaces the QR, so the customer
 * is not invited to pay twice: a spent token is checked for the grace
 * before it is said spent elsewhere (cashu/0030).
 */
const arrivalKeepsRequest = {
  untrustedMint: true,
  receiving: false,
  waitingForMint: false,
  received: false,
  receivingElsewhere: false,
  checkingElsewhere: false,
  receivedElsewhere: true,
  contested: true,
  failed: true,
} satisfies Record<CashuTokenArrivalState, boolean>

/** Whether the wait screen says this arrival beside the QR (cashu/0020). */
export const cashuArrivalKeepsRequest = (
  state: CashuTokenArrivalState
): boolean => arrivalKeepsRequest[state]

/** The mint enabling Cashu trusts (cashu/0013), Linky's default too. */
export const MAIN_MINT_URL = MintUrl("https://cashu.cz")

/** `cashuMintTrust.trustedMintsJson` as stored (cashu/0013). */
export const CashuTrustedMintsJson = jsonCodec(MintUrlSchema.array().readonly())

/** What `cashuTrustedMintsQuery` reads of the account's trusted mints. */
export interface CashuMintTrustCells {
  readonly trustedMintsJson: string | null
  readonly seedMintUrl: MintUrl | null
}

/**
 * The trusted mints, the default first (cashu/0013): the list the merchant
 * last wrote on any device, else the mint enabling Cashu seeded. Empty when
 * this device knows neither: it has not synced the account's mints, and
 * `MAIN_MINT_URL` may be one the merchant untrusted (cashu/0018).
 */
export const trustedCashuMintsOf = (
  rows: ReadonlyArray<CashuMintTrustCells>
): ReadonlyArray<MintUrl> => {
  const [row] = rows
  if (row === undefined) return []
  if (row.trustedMintsJson === null)
    return row.seedMintUrl === null ? [] : [row.seedMintUrl]
  const decoded = z.safeDecode(CashuTrustedMintsJson, row.trustedMintsJson)
  return decoded.success ? [...new Set(decoded.data)] : []
}

/**
 * Whether no device has written the account's mints, list or seed, as far
 * as this device's rows show (cashu/0013). Read from the cells, not the
 * decoded list: a list this device cannot decode was written all the same,
 * and a seed would never count against it.
 */
export const hasNoCashuMintCells = (
  rows: ReadonlyArray<CashuMintTrustCells>
): boolean => {
  const [row] = rows
  return (
    row === undefined ||
    (row.trustedMintsJson === null && row.seedMintUrl === null)
  )
}

/**
 * The default mint (cashu/0013): the first trusted one. Null with none
 * trusted, on a device that has not synced the mints (cashu/0018).
 */
export const pickDefaultCashuMint = (
  trusted: ReadonlyArray<MintUrl>
): MintUrl | null => trusted[0] ?? null

/**
 * The default once `mint` is no longer trusted (cashu/0015): the next in
 * the list, the previous choice, or null when `mint` is the last trusted
 * mint.
 */
export const defaultCashuMintWithout = (
  trusted: ReadonlyArray<MintUrl>,
  mint: MintUrl
): MintUrl | null =>
  pickDefaultCashuMint(trusted.filter((trustedMint) => trustedMint !== mint))

/**
 * The mints a NUT-18 request names: the trusted ones in order, capped; none
 * with no trusted mint, which leaves the request out of the QR (cashu/0018).
 */
export const orderCashuRequestMints = (
  trusted: ReadonlyArray<MintUrl>,
  max: number
): ReadonlyArray<MintUrl> => trusted.slice(0, max)

/** Suggestions on the mints screen; Linky's test mint is left out on purpose. */
export const PRODUCTION_MINTS: ReadonlyArray<MintUrl> = [
  MAIN_MINT_URL,
  MintUrl("https://mint.minibits.cash/Bitcoin"),
  MintUrl("https://kashu.me"),
  MintUrl("https://cashu.21m.lol"),
]

/**
 * What the merchant typed as a mint URL: `https://` when no scheme is given,
 * a dot in the host, then normalised.
 */
export const parseMintUrlInput = (text: string): MintUrl | null => {
  const trimmed = text.trim()
  if (trimmed === "") return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    if (!new URL(withScheme).hostname.includes(".")) return null
  } catch {
    return null
  }
  return normalizeMintUrl(withScheme)
}

/** NUT-12's DLEQ proof as cashu-ts carries it, stored in `cashuProof.dleq`. */
export const cashuDleqCodec = jsonCodec(
  z.looseObject({
    e: z.string(),
    s: z.string(),
    r: z.string().optional(),
  })
)

/** A `defineError` value, stored in `cashuOperation.error`. */
export const cashuErrorCodec = jsonCodec(z.looseObject({ type: z.string() }))

/** The error column's text: the encoded error, cut to the column's 1000. */
export const encodeCashuError = (error: { readonly type: string }): string =>
  z.encode(cashuErrorCodec, error).slice(0, 1000)

const JsonValue = jsonCodec(z.unknown())

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const trimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

const isProofRecord = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  trimmedString(value.secret) !== null &&
  trimmedString(value.C) !== null &&
  trimmedString(value.id) !== null &&
  typeof value.amount === "number" &&
  Number.isFinite(value.amount)

const flattenProofs = (
  value: unknown
): ReadonlyArray<Record<string, unknown>> | null => {
  if (!Array.isArray(value) || value.length === 0) return null
  const proofs: Array<Record<string, unknown>> = []
  const collect = (element: unknown): boolean => {
    if (isProofRecord(element)) {
      proofs.push(element)
      return true
    }
    return Array.isArray(element) && element.every(collect)
  }
  return value.every(collect) ? proofs : null
}

/**
 * A token's one text: a bare `cashu…` text trimmed, with no inner
 * whitespace; a JSON proof bundle — the NUT-18 payload included —
 * re-serialised as-is into v3 `cashuA` text. The receive operation's id
 * hashes this text, so every device must agree on it to the byte. Null for
 * anything else.
 */
export const normalizeCashuTokenText = (raw: string): CashuTokenText | null => {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  if (trimmed.startsWith("cashu")) {
    const text = CashuTokenTextSchema.safeParse(trimmed)
    return /\s/u.test(trimmed) || !text.success ? null : text.data
  }
  if (!trimmed.startsWith("{")) return null
  const parsed = z.safeDecode(JsonValue, trimmed)
  if (!parsed.success || !isRecord(parsed.data)) return null
  const mint = trimmedString(parsed.data.mint)
  const unit = trimmedString(parsed.data.unit)
  const proofs = flattenProofs(parsed.data.proofs)
  if (mint === null || proofs === null) return null
  const json = JSON.stringify({
    token: [{ mint, proofs }],
    ...(unit === null ? {} : { unit }),
  })
  const text = CashuTokenTextSchema.safeParse(
    `cashuA${base64urlnopad.encode(new TextEncoder().encode(json))}`
  )
  return text.success ? text.data : null
}
