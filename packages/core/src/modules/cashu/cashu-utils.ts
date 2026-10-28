import { createIdFromString } from "@evolu/common"
import { base64urlnopad } from "@scure/base"
import { z } from "zod"
import { jsonCodec } from "../../zod-utils.ts"
import type { PaymentId } from "../payment/payment-types.ts"
import { type TimestampMs, TimestampMsSchema } from "../shared/schema.ts"
import {
  type CashuClaimAttemptId,
  type CashuCounterId,
  type CashuMintId,
  type CashuMoveId,
  type CashuOperationId,
  type CashuProofId,
  type CashuProofState,
  type CashuQuoteId,
  type CashuTokenArrivalId,
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

/** Every id below derives from what the row is about, so devices agree on it. */
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

export const cashuMintIdFor = (mint: MintUrl): CashuMintId =>
  createIdFromString<"CashuMint">(`mint|${mint}`)

export const cashuCounterIdFor = (
  mint: MintUrl,
  keysetId: KeysetId
): CashuCounterId =>
  createIdFromString<"CashuCounter">(`counter|${mint}|sat|${keysetId}`)

export const cashuClaimAttemptIdFor = (
  operationId: CashuOperationId
): CashuClaimAttemptId =>
  createIdFromString<"CashuClaimAttempt">(`claim-attempt|${operationId}`)

export const cashuTokenArrivalIdFor = (
  paymentId: PaymentId
): CashuTokenArrivalId =>
  createIdFromString<"CashuTokenArrival">(`token-arrival|${paymentId}`)

/** The default mint of a new account (cashu/0013), Linky's default too. */
export const MAIN_MINT_URL = MintUrl("https://cashu.cz")

/** A trusted mint as the default and the request order read it. */
export interface TrustedCashuMint {
  readonly mintUrl: MintUrl
  readonly defaultedAt: number | null
  /** Evolu's ISO timestamp of the row, for the fallback (cashu/0013). */
  readonly createdAt: string
}

/**
 * The default mint (cashu/0013): the trusted mint with the newest
 * `defaultedAt`, a tie going to the smaller URL so every device picks the
 * same one. `chosen` is false for the fallback when no trusted mint was ever
 * chosen: the newest trusted mint, else `MAIN_MINT_URL`.
 */
export const pickDefaultCashuMint = (
  trusted: ReadonlyArray<TrustedCashuMint>
): { readonly mintUrl: MintUrl; readonly chosen: boolean } => {
  const [first] = [...trusted].sort(compareForDefault)
  if (first === undefined) return { mintUrl: MAIN_MINT_URL, chosen: false }
  return { mintUrl: first.mintUrl, chosen: first.defaultedAt !== null }
}

const compareForDefault = (
  a: TrustedCashuMint,
  b: TrustedCashuMint
): number => {
  if (a.defaultedAt !== b.defaultedAt) {
    if (a.defaultedAt === null) return 1
    if (b.defaultedAt === null) return -1
    return b.defaultedAt - a.defaultedAt
  }
  if (a.defaultedAt === null && a.createdAt !== b.createdAt)
    return a.createdAt < b.createdAt ? 1 : -1
  return a.mintUrl < b.mintUrl ? -1 : a.mintUrl > b.mintUrl ? 1 : 0
}

/**
 * The default once `mint` is no longer trusted (cashu/0016): the next newest
 * choice, or null when `mint` is the last trusted mint.
 */
export const defaultCashuMintWithout = (
  trusted: ReadonlyArray<TrustedCashuMint>,
  mint: MintUrl
): MintUrl | null => {
  const remaining = trusted.filter((row) => row.mintUrl !== mint)
  return remaining.length === 0 ? null : pickDefaultCashuMint(remaining).mintUrl
}

/**
 * The trusted mints, the default first, then by `defaultedAt` descending and
 * the never-chosen ones by URL (cashu/0017). With no trusted row the default
 * `MAIN_MINT_URL` is the only one, since the default is always trusted.
 */
export const orderTrustedCashuMints = (
  trusted: ReadonlyArray<TrustedCashuMint>
): ReadonlyArray<MintUrl> => {
  const { mintUrl: defaultMint } = pickDefaultCashuMint(trusted)
  const rest = trusted
    .filter((row) => row.mintUrl !== defaultMint)
    .sort((a, b) => {
      if (a.defaultedAt !== b.defaultedAt) {
        if (a.defaultedAt === null) return 1
        if (b.defaultedAt === null) return -1
        return b.defaultedAt - a.defaultedAt
      }
      return a.mintUrl < b.mintUrl ? -1 : a.mintUrl > b.mintUrl ? 1 : 0
    })
    .map((row) => row.mintUrl)
  return [defaultMint, ...rest]
}

/** The mints a NUT-18 request names: the trusted ones in order, capped. */
export const orderCashuRequestMints = (
  trusted: ReadonlyArray<TrustedCashuMint>,
  max: number
): ReadonlyArray<MintUrl> => orderTrustedCashuMints(trusted).slice(0, max)

/**
 * The `defaultedAt` of a new choice: now, or later than every one this
 * device knows when another device's clock ran ahead (cashu/0013).
 */
export const nextDefaultedAt = (
  nowMs: number,
  newest: number | null
): TimestampMs =>
  TimestampMsSchema.decode(
    newest === null ? nowMs : Math.max(nowMs, newest + 1)
  )

/**
 * The `defaultedAt` of a default Payky writes on the merchant's behalf, the
 * seed and the fallback (cashu/0013): below every real choice, so a device
 * that has the Cashu account but not yet its mints overrides no choice made
 * elsewhere.
 */
export const WEAKEST_DEFAULTED_AT = TimestampMsSchema.decode(0)

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

/** The available balance per mint. */
export const sumAvailableByMint = (
  proofs: ReadonlyArray<{
    readonly mintUrl: MintUrl
    readonly amount: number
    readonly state: CashuProofState
  }>
): ReadonlyMap<MintUrl, number> =>
  proofs.reduce((balances, proof) => {
    if (proof.state !== "available") return balances
    balances.set(
      proof.mintUrl,
      (balances.get(proof.mintUrl) ?? 0) + proof.amount
    )
    return balances
  }, new Map<MintUrl, number>())

/** How many proofs `amount` splits into: one per set bit. */
export const proofCountOf = (amount: number): number =>
  amount.toString(2).replaceAll("0", "").length

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
