import type { IndexesConfig } from "@evolu/common/local-first"
import { z } from "zod"
import { PaymentId } from "../payment/payment-types.ts"
import {
  type InferTable,
  NonNegativeIntegerSchema,
  TimestampMsSchema,
} from "../shared/schema.ts"
import {
  CashuAmountSchema,
  CashuAttemptRoleSchema,
  CashuBolt11Schema,
  CashuCounterId,
  CashuMeltPurposeSchema,
  CashuMintCacheId,
  CashuMintTrustId,
  CashuMoveId,
  CashuOperationAttemptId,
  CashuOperationId,
  CashuOperationKindSchema,
  CashuOperationStatusSchema,
  CashuProofId,
  CashuQuoteIdSchema,
  CashuTokenArrivalId,
  CashuTokenArrivalStateSchema,
  CashuTokenTextSchema,
  CashuTopupPurposeSchema,
  KeysetIdSchema,
  MintUrlSchema,
} from "./cashu-types.ts"

/**
 * Payky's own Cashu wallet (cashu/0012): its tables in the app database, under
 * the app owner like every other domain table (cashu/0012). Tables with a
 * leading underscore are local to this device and never sync.
 */

const ShortTextSchema = z.string().min(1).max(1000)
const SqliteBooleanSchema = z.union([z.literal(0), z.literal(1)])

/**
 * One proof, its id derived from its secret, so a proof never duplicates.
 * Its state is read from two cells, never stored as one (cashu/0024):
 * `spent` once `isSpent`, else `held` while a melt's `operationId` holds it,
 * else `available`. Only the melt that holds a proof writes `operationId`, and
 * a restore writes the proof's identity alone, so neither undoes the other.
 */
export const cashuProof = {
  id: CashuProofId,
  mintUrl: MintUrlSchema,
  keysetId: KeysetIdSchema,
  amount: CashuAmountSchema,
  secret: ShortTextSchema,
  /** The NUT-00 signature point `C`, hex. */
  c: ShortTextSchema,
  /** The NUT-12 DLEQ proof when the mint supplied one, via `jsonCodec`. */
  dleq: ShortTextSchema.nullable(),
  /**
   * Set once the proof is spent and never cleared (cashu/0024): a spend
   * outranks every later write of the row, whichever device made it.
   */
  isSpent: SqliteBooleanSchema.nullable(),
  /** The melt that holds or spent it; null when none holds it. */
  operationId: CashuOperationId.nullable(),
} as const

/**
 * The root of every operation, its id derived from what it is about so every
 * device writes the same row (`cashu-utils.ts`). Each kind has a detail table
 * sharing the id.
 */
export const cashuOperation = {
  id: CashuOperationId,
  kind: CashuOperationKindSchema,
  status: CashuOperationStatusSchema,
  mintUrl: MintUrlSchema,
  amount: CashuAmountSchema,
  /** The keyset the outputs derive from. */
  keysetId: KeysetIdSchema.nullable(),
  /** The last failure, a `defineError` value via `jsonCodec`. */
  error: ShortTextSchema.nullable(),
  /** When it reached `done` or `paid`. */
  settledAt: TimestampMsSchema.nullable(),
} as const

/** A mint quote paid over Lightning: a payment's leg, or a move's target. */
export const cashuTopup = {
  id: CashuOperationId,
  quoteId: CashuQuoteIdSchema,
  lnInvoice: CashuBolt11Schema,
  expiresAt: TimestampMsSchema.nullable(),
  /** NUT-20: the quote is locked to Payky's nostr key. */
  locked: SqliteBooleanSchema,
  purpose: CashuTopupPurposeSchema,
} as const

/** A token swapped into the wallet. */
export const cashuReceive = {
  id: CashuOperationId,
  tokenText: CashuTokenTextSchema,
  /** The mint's NUT-02 input fee, known before the swap (cashu/0009). */
  fee: NonNegativeIntegerSchema,
} as const

/** A Lightning invoice paid from one mint: a withdrawal, or a move's source. */
export const cashuMelt = {
  id: CashuOperationId,
  quoteId: CashuQuoteIdSchema,
  lnInvoice: CashuBolt11Schema,
  feeReserve: NonNegativeIntegerSchema,
  /**
   * What the melt takes from the balance before its change: the held
   * sources until the pre-swap answers, then the melt's inputs plus the
   * pre-swap's input fee.
   */
  inputsTotal: NonNegativeIntegerSchema,
  purpose: CashuMeltPurposeSchema,
  /**
   * When the mint stops accepting the quote; null when it never says. Past
   * it an UNPAID answer is final, which lets another device close a melt
   * its sender left (cashu/0027).
   */
  expiresAt: TimestampMsSchema.nullable(),
} as const

/** Funds moved between mints: a melt at the source pays a topup at the target. */
export const cashuMove = {
  id: CashuMoveId,
  sourceMintUrl: MintUrlSchema,
  targetMintUrl: MintUrlSchema,
  meltOperationId: CashuOperationId,
  topupOperationId: CashuOperationId,
} as const

/**
 * The mints the merchant trusts (cashu/0016, cashu/0013), one row per account
 * at a fixed id. Payky receives tokens from them and names them in the
 * NUT-18 request; the first is the default.
 *
 * The list is one cell, so every write is a whole list some device saw with
 * a mint in it: two devices' changes merge into one of them, never into a
 * list no device wrote, and no merge leaves no mint trusted.
 */
export const cashuMintTrust = {
  id: CashuMintTrustId,
  /**
   * The trusted mints as JSON (`CashuTrustedMintsJson`), the default first,
   * never empty; null until the merchant first changes them.
   */
  trustedMintsJson: z.string().nullable(),
  /**
   * The mint enabling Cashu trusted (cashu/0013), read only while
   * `trustedMintsJson` is null: a list written on any device wins over it,
   * whichever write came later.
   */
  seedMintUrl: MintUrlSchema.nullable(),
} as const

/**
 * This device's NUT-13 counter per `mint|sat|keysetId`: the next free slot.
 * It never moves back; a gap costs a restore scan, a reuse a mint rejection.
 */
export const _cashuCounter = {
  id: CashuCounterId,
  mintUrl: MintUrlSchema,
  keysetId: KeysetIdSchema,
  next: NonNegativeIntegerSchema,
  /**
   * The keyset's orphans were recovered here, once this device had synced
   * (cashu/0031): a later first use of the lock does not scan for them.
   */
  orphansRecovered: SqliteBooleanSchema.nullable(),
} as const

/**
 * One call's NUT-13 slots for an operation, by whichever device, written
 * before the mint is called (cashu/0029): exactly the slots the prepared call
 * asks the mint to sign, and which call it is (cashu/0039). Written once and
 * changed only by its marks: every attempt any device made stays on record,
 * and since the seed is the account's, any device can reclaim the outputs of
 * any of them through NUT-09.
 */
export const cashuOperationAttempt = {
  id: CashuOperationAttemptId,
  operationId: CashuOperationId,
  keysetId: KeysetIdSchema,
  /** The first slot of the call's outputs. */
  counter: NonNegativeIntegerSchema,
  /**
   * How many outputs the call asks for, in the slots from `counter`: none
   * for a melt request with no change to take (cashu/0039).
   */
  slots: NonNegativeIntegerSchema,
  /** Which call the slots are for (cashu/0039). */
  role: CashuAttemptRoleSchema,
  /**
   * Set once the mint refused the one call made with this block (cashu/0029):
   * it signed nothing there for this operation. Never cleared.
   */
  isRejected: SqliteBooleanSchema.nullable(),
  /**
   * Set once outputs of a contest over this block, between this operation
   * and another that could have signed them, were given to no one: stored
   * in the wallet with no booking (cashu/0029). Whichever
   * operation's reclaim settled the contest marks every side. Never cleared.
   */
  isContested: SqliteBooleanSchema.nullable(),
} as const

/** The attempts this device made: how it tells its own from another's. */
export const _cashuOwnAttempt = {
  id: CashuOperationAttemptId,
  operationId: CashuOperationId,
  /**
   * A melt's fence (cashu/0019): this device reserved it to settle a melt,
   * which says nothing about whether it sent that melt (cashu/0027).
   */
  isFence: SqliteBooleanSchema.nullable(),
} as const

/** What the wait screen shows of a token sent for a payment, one per payment. */
export const _cashuTokenArrival = {
  id: CashuTokenArrivalId,
  paymentId: PaymentId,
  mintUrl: MintUrlSchema,
  amount: CashuAmountSchema,
  /** The mint's input fee, once the mint was asked. */
  fee: NonNegativeIntegerSchema.nullable(),
  state: CashuTokenArrivalStateSchema,
  /** The refusal's error type, when there is one. */
  failure: z.string().min(1).max(100).nullable(),
} as const

/**
 * A mint's info and keysets as cashu-ts last loaded them on this device, so
 * a wallet loads without asking the mint first (`createCashuMintCache`).
 */
export const _cashuMintCache = {
  id: CashuMintCacheId,
  mintUrl: MintUrlSchema,
  /** NUT-06 `GetInfoResponse` JSON. */
  infoJson: z.string(),
  /** cashu-ts `KeyChainCache` JSON. */
  keychainJson: z.string(),
} as const

export const cashuIndexes = ((create) => [
  create("cashuProof_mintUrl_isSpent_operationId")
    .on("cashuProof")
    .columns(["mintUrl", "isSpent", "operationId"]),
  create("cashuProof_operationId").on("cashuProof").column("operationId"),
  create("cashuProof_keysetId").on("cashuProof").column("keysetId"),
  create("cashuOperation_kind_status")
    .on("cashuOperation")
    .columns(["kind", "status"]),
  create("cashuOperationAttempt_operationId")
    .on("cashuOperationAttempt")
    .column("operationId"),
  create("cashuOperationAttempt_keysetId_counter")
    .on("cashuOperationAttempt")
    .columns(["keysetId", "counter"]),
  create("_cashuTokenArrival_paymentId")
    .on("_cashuTokenArrival")
    .column("paymentId"),
]) satisfies IndexesConfig

export type CashuProofRow = InferTable<typeof cashuProof>
export type CashuOperationRow = InferTable<typeof cashuOperation>
