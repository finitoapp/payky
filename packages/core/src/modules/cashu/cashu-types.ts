import { id } from "@evolu/common"
import { z } from "zod"
import { standardSchemaToZod } from "../../zod-utils.ts"
import { PositiveIntegerSchema } from "../shared/schema.ts"

/** The proof id hashes the secret, so a synced or restored proof never duplicates. */
export const CashuProofIdRaw = id("CashuProof")
export const CashuProofId = standardSchemaToZod(CashuProofIdRaw)
export type CashuProofId = typeof CashuProofIdRaw.Output

export const CashuOperationIdRaw = id("CashuOperation")
export const CashuOperationId = standardSchemaToZod(CashuOperationIdRaw)
export type CashuOperationId = typeof CashuOperationIdRaw.Output

export const CashuMoveIdRaw = id("CashuMove")
export const CashuMoveId = standardSchemaToZod(CashuMoveIdRaw)
export type CashuMoveId = typeof CashuMoveIdRaw.Output

export const CashuMintIdRaw = id("CashuMint")
export const CashuMintId = standardSchemaToZod(CashuMintIdRaw)
export type CashuMintId = typeof CashuMintIdRaw.Output

export const CashuCounterIdRaw = id("CashuCounter")
export const CashuCounterId = standardSchemaToZod(CashuCounterIdRaw)
export type CashuCounterId = typeof CashuCounterIdRaw.Output

export const CashuClaimAttemptIdRaw = id("CashuClaimAttempt")
export const CashuClaimAttemptId = standardSchemaToZod(CashuClaimAttemptIdRaw)
export type CashuClaimAttemptId = typeof CashuClaimAttemptIdRaw.Output

export const CashuTokenArrivalIdRaw = id("CashuTokenArrival")
export const CashuTokenArrivalId = standardSchemaToZod(CashuTokenArrivalIdRaw)
export type CashuTokenArrivalId = typeof CashuTokenArrivalIdRaw.Output

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
 * A mint's identity, normalised by `normalizeMintUrl` (`cashu-utils.ts`).
 * Proofs, operations and counters are keyed by this string, so two spellings
 * of one mint would fork the wallet.
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

/** A mint's quote id, unique within that mint only. */
export const CashuQuoteIdSchema = z
  .string()
  .min(1)
  .max(1000)
  .brand<"CashuQuoteId">()
export type CashuQuoteId = z.output<typeof CashuQuoteIdSchema>
export const CashuQuoteId = CashuQuoteIdSchema.decode

/** A positive amount in the wallet unit (sats). */
export const CashuAmountSchema = PositiveIntegerSchema.brand<"CashuAmount">()
export type CashuAmount = z.output<typeof CashuAmountSchema>
export const CashuAmount = CashuAmountSchema.decode

/**
 * - `available` — spendable balance
 * - `held` — an input of the in-flight melt its `operationId` names
 * - `spent` — final
 */
export const CashuProofStateSchema = z.enum(["available", "held", "spent"])
export type CashuProofState = z.output<typeof CashuProofStateSchema>

export const CashuOperationKindSchema = z.enum(["topup", "receive", "melt"])
export type CashuOperationKind = z.output<typeof CashuOperationKindSchema>

/**
 * `topup` and `receive` go `pending` → `done` | `failed`; `melt` goes
 * `pending` → `paid` | `unpaid` | `failed`.
 */
export const CashuOperationStatusSchema = z.enum([
  "pending",
  "done",
  "paid",
  "unpaid",
  "failed",
])
export type CashuOperationStatus = z.output<typeof CashuOperationStatusSchema>

/** Why a topup exists: a payment's Lightning leg, or the target of a move. */
export const CashuTopupPurposeSchema = z.enum(["payment", "move"])
export type CashuTopupPurpose = z.output<typeof CashuTopupPurposeSchema>

/** Why a melt exists: a withdrawal, or the source of a move. */
export const CashuMeltPurposeSchema = z.enum(["withdrawal", "move"])
export type CashuMeltPurpose = z.output<typeof CashuMeltPurposeSchema>

/**
 * What the wait screen shows of a token sent for a payment:
 *
 * - `untrustedMint` — from a mint the merchant does not trust (cashu/0017),
 *   not received
 * - `receiving` — being swapped
 * - `waitingForMint` — the mint did not answer; tried again later
 * - `received` — in the wallet
 * - `receivedElsewhere` — another wallet swapped it first (cashu/0015)
 * - `failed` — refused for good
 */
export const CashuTokenArrivalStateSchema = z.enum([
  "untrustedMint",
  "receiving",
  "waitingForMint",
  "received",
  "receivedElsewhere",
  "failed",
])
export type CashuTokenArrivalState = z.output<
  typeof CashuTokenArrivalStateSchema
>
