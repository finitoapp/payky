import { id } from "@evolu/common"
import { z } from "zod"
import {
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "@/core/modules/shared/schema.ts"
import { standardSchemaToZod } from "@/zod-utils.ts"

/**
 * Linky's ids and column types (`packages/domain/src/ids.ts`,
 * `packages/linksync/src/model/schema.ts`, the decode rules of
 * `packages/linkshu/src/domain/primitives.ts`). Rows Payky writes must pass
 * Linky's decoders, or Linky silently skips them (cashu.md, "Writing rows
 * Linky can read"); the brands below are those rules. Nothing trims: a value
 * must be stored exactly as Linky would store it.
 */

export const CashuProofIdRaw = id("CashuProof")
export const CashuProofId = standardSchemaToZod(CashuProofIdRaw)
export type CashuProofId = typeof CashuProofIdRaw.Output

export const CashuOperationIdRaw = id("CashuOperation")
export const CashuOperationId = standardSchemaToZod(CashuOperationIdRaw)
export type CashuOperationId = typeof CashuOperationIdRaw.Output

export const ShardPointerIdRaw = id("ShardPointer")
export const ShardPointerId = standardSchemaToZod(ShardPointerIdRaw)
export type ShardPointerId = typeof ShardPointerIdRaw.Output

/** Linky's `setting` table, not Payky's `appSettings` (docs/glossary.md). */
export const LinkySettingIdRaw = id("Setting")
export const LinkySettingId = standardSchemaToZod(LinkySettingIdRaw)
export type LinkySettingId = typeof LinkySettingIdRaw.Output

export const CashuBookingCursorIdRaw = id("CashuBookingCursor")
export const CashuBookingCursorId = standardSchemaToZod(CashuBookingCursorIdRaw)
export type CashuBookingCursorId = typeof CashuBookingCursorIdRaw.Output

/** Evolu's `NonEmptyString100`/`NonEmptyString1000`, without trimming. */
export const LinkyString100Schema = z
  .string()
  .min(1)
  .max(100)
  .brand<"LinkyString100">()
export const LinkyString1000Schema = z
  .string()
  .min(1)
  .max(1000)
  .brand<"LinkyString1000">()
export type LinkyString1000 = z.output<typeof LinkyString1000Schema>

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0
    )
  } catch {
    return false
  }
}

/**
 * A mint's identity, normalised exactly as Linky normalises it
 * (`normalizeMintUrl` in `cashu-utils.ts`). Proofs, operations and counters
 * are keyed by this string, so two spellings of one mint fork the wallet.
 */
export const MintUrlSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine((value) => value === value.trim() && isHttpUrl(value), {
    message: "A mint url is an http(s) url with a host.",
  })
  .refine((value) => !value.endsWith("/"), {
    message: "A normalised mint url has no trailing slash.",
  })
  .brand<"MintUrl">()
export type MintUrl = z.output<typeof MintUrlSchema>
export const MintUrl = MintUrlSchema.decode

export const CashuUnitSchema = z.literal("sat")
export type CashuUnit = z.output<typeof CashuUnitSchema>

/** Hex keyset id bytes, even length (NUT-02). */
export const KeysetIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^(?:[0-9a-f]{2})+$/iu)
  .brand<"KeysetId">()
export type KeysetId = z.output<typeof KeysetIdSchema>
export const KeysetId = KeysetIdSchema.decode

/** A serialised token, `cashuA…`/`cashuB…`, stored exactly as received. */
export const CashuTokenTextSchema = z
  .string()
  .refine((value) => value.length > 0 && value === value.trim(), {
    message: "A token text is non-empty and trimmed.",
  })
  .refine((value) => value.startsWith("cashu"), {
    message: "A token text starts with cashu.",
  })
  .brand<"CashuTokenText">()
export type CashuTokenText = z.output<typeof CashuTokenTextSchema>
export const CashuTokenText = CashuTokenTextSchema.decode

/** A bolt11 invoice as a mint quote carries it. */
export const CashuBolt11Schema = z
  .string()
  .refine(
    (value) =>
      value.length > 0 &&
      value === value.trim() &&
      value.toLowerCase().startsWith("ln"),
    { message: "A bolt11 invoice starts with ln." }
  )
  .brand<"CashuBolt11">()
export type CashuBolt11 = z.output<typeof CashuBolt11Schema>
export const CashuBolt11 = CashuBolt11Schema.decode

export const CashuQuoteIdSchema = LinkyString1000Schema
export type CashuQuoteId = z.output<typeof CashuQuoteIdSchema>

/** A positive amount in the wallet unit (sats). */
export const CashuAmountSchema = PositiveIntegerSchema.brand<"CashuAmount">()
export type CashuAmount = z.output<typeof CashuAmountSchema>
export const CashuAmount = CashuAmountSchema.decode

export const NonNegativeIntSchema = NonNegativeIntegerSchema
export const PositiveIntSchema = PositiveIntegerSchema
export const SqliteBooleanSchema = z.union([z.literal(0), z.literal(1)])

/**
 * - `available` — spendable balance
 * - `held` — inputs of an in-flight melt or an open envelope; a null
 *   `operationId` means its holder has not synced yet
 * - `handedOut` — in a token someone may claim
 * - `externalized` — handed off outside the app
 * - `spent` — terminal
 */
export const CashuProofStateSchema = z.enum([
  "available",
  "held",
  "handedOut",
  "externalized",
  "spent",
])
export type CashuProofState = z.output<typeof CashuProofStateSchema>

export const CashuOperationKindSchema = z.enum([
  "melt",
  "topup",
  "autoswap",
  "send",
  "receive",
  "deferredReceive",
  "envelope",
])
export type CashuOperationKind = z.output<typeof CashuOperationKindSchema>

/**
 * Per kind (`linkshu/docs/concepts.md`): `topup`/`autoswap`/`receive` go
 * `pending` → `done` | `failed`; `melt` goes `pending` → `paid` | `unpaid` |
 * `failed`.
 */
export const CashuOperationStatusSchema = z.enum([
  "pending",
  "paid",
  "unpaid",
  "done",
  "failed",
  "issued",
  "externalized",
  "returned",
])
export type CashuOperationStatus = z.output<typeof CashuOperationStatusSchema>

/**
 * The one shard scope Payky reads or writes. Linky's other scopes keep
 * pointers under the same owner (`contacts`, `messages`, ...); Payky leaves
 * them alone.
 */
export const cashuShardScope = "cashu"
