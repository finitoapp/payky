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
  CashuBolt11Schema,
  CashuClaimAttemptId,
  CashuCounterId,
  CashuMeltPurposeSchema,
  CashuMintId,
  CashuMoveId,
  CashuOperationId,
  CashuOperationKindSchema,
  CashuOperationStatusSchema,
  CashuProofId,
  CashuProofStateSchema,
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

/** One proof, its id derived from its secret, so a proof never duplicates. */
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
  state: CashuProofStateSchema,
  /** The melt that holds or spent it. */
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
  /** First NUT-13 slot of the latest attempt, written before the mint call. */
  counter: NonNegativeIntegerSchema.nullable(),
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
  inputsTotal: NonNegativeIntegerSchema,
  purpose: CashuMeltPurposeSchema,
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
 * A mint the merchant trusts (cashu/0017): Payky receives tokens from it and
 * names it in the NUT-18 request. A tombstone is a mint no longer trusted.
 * The default mint is the trusted row with the newest `defaultedAt`
 * (cashu/0013); a timestamp, not a flag, so that choices made on two devices
 * merge into one default.
 */
export const cashuMint = {
  id: CashuMintId,
  mintUrl: MintUrlSchema,
  /** When the mint was last chosen as the default; null if never. */
  defaultedAt: TimestampMsSchema.nullable(),
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
} as const

/**
 * The counter this device reserved for an operation: how it tells its own
 * attempt from another device's synced `counter` (cashu/0015).
 */
export const _cashuClaimAttempt = {
  id: CashuClaimAttemptId,
  operationId: CashuOperationId,
  counter: NonNegativeIntegerSchema,
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

export const cashuIndexes = ((create) => [
  create("cashuProof_mintUrl_state")
    .on("cashuProof")
    .columns(["mintUrl", "state"]),
  create("cashuProof_operationId").on("cashuProof").column("operationId"),
  create("cashuProof_keysetId").on("cashuProof").column("keysetId"),
  create("cashuOperation_kind_status")
    .on("cashuOperation")
    .columns(["kind", "status"]),
  create("cashuMint_isDeleted_defaultedAt")
    .on("cashuMint")
    .columns(["isDeleted", "defaultedAt"]),
  create("_cashuTokenArrival_paymentId")
    .on("_cashuTokenArrival")
    .column("paymentId"),
]) satisfies IndexesConfig

export type CashuProofRow = InferTable<typeof cashuProof>
export type CashuOperationRow = InferTable<typeof cashuOperation>
