import type { IndexesConfig } from "@evolu/common/local-first"

import {
  CashuAmountSchema,
  CashuBookingCursorId,
  CashuBolt11Schema,
  CashuOperationId,
  CashuOperationKindSchema,
  CashuOperationStatusSchema,
  CashuProofId,
  CashuProofStateSchema,
  CashuQuoteIdSchema,
  CashuTokenTextSchema,
  KeysetIdSchema,
  LinkySettingId,
  LinkyString100Schema,
  LinkyString1000Schema,
  MintUrlSchema,
  NonNegativeIntSchema,
  PositiveIntSchema,
  ShardPointerId,
  SqliteBooleanSchema,
} from "@/core/modules/cashu/cashu-types.ts"
import type { InferTable } from "@/core/modules/shared/schema.ts"

/**
 * Linky's four tables (`packages/linksync/src/model/schema.ts`), copied
 * column for column. They hold Linky's rows, synced under Linky's owners,
 * never Payky's own (cashu.md §2): only `src/core/cashu/cashu-shard-store.ts`
 * writes them and only `cashu-queries.ts` reads them, which
 * `cashu-table-isolation.test.ts` holds. Optional columns are nullable, and
 * a write leaves them out rather than writing `null`, as Linky does.
 */

/** Meta scope (Linky's app owner): which shard index a scope writes to. */
export const shardPointer = {
  id: ShardPointerId,
  scope: LinkyString100Schema,
  index: NonNegativeIntSchema,
  rotatedAtMs: PositiveIntSchema.nullable(),
} as const

/**
 * Meta scope: Linky's synced key/value settings (`defaultMint`, ...), not
 * Payky's `appSettings`. Values are codec-encoded text whose encodings never
 * change (`linksync/src/model/settings.ts`).
 */
export const setting = {
  id: LinkySettingId,
  key: LinkyString100Schema,
  value: LinkyString1000Schema,
} as const

/** Cashu scope: one row per proof, the id derived from its secret. */
export const cashuProof = {
  id: CashuProofId,
  mint: MintUrlSchema,
  unit: LinkyString100Schema,
  keysetId: KeysetIdSchema,
  amount: CashuAmountSchema,
  secret: LinkyString1000Schema,
  /** The NUT-00 signature point `C`. */
  c: LinkyString1000Schema,
  /** JSON of the NUT-12 DLEQ proof when the mint supplied one. */
  dleq: LinkyString1000Schema.nullable(),
  state: CashuProofStateSchema,
  operationId: CashuOperationId.nullable(),
} as const

/** Cashu scope: the durable links between inputs and outputs. */
export const cashuOperation = {
  id: CashuOperationId,
  kind: CashuOperationKindSchema,
  status: CashuOperationStatusSchema,
  /** The target mint of an `autoswap`. */
  mint: MintUrlSchema,
  unit: LinkyString100Schema,
  keysetId: KeysetIdSchema.nullable(),
  amount: CashuAmountSchema,
  feeReserve: NonNegativeIntSchema.nullable(),
  inputsTotal: PositiveIntSchema.nullable(),
  quoteId: CashuQuoteIdSchema.nullable(),
  invoice: CashuBolt11Schema.nullable(),
  sourceMint: MintUrlSchema.nullable(),
  /** First deterministic output slot of the latest attempt; synced. */
  counter: NonNegativeIntSchema.nullable(),
  locked: SqliteBooleanSchema.nullable(),
  expiresAtSec: PositiveIntSchema.nullable(),
  /** Event time, distinct from Evolu's timestamps. */
  createdAtSec: PositiveIntSchema,
  tokenText: CashuTokenTextSchema.nullable(),
  error: LinkyString1000Schema.nullable(),
} as const

/**
 * Payky's own, local-only (the leading underscore keeps Evolu from syncing
 * it): the `evolu_history` rowid up to which the booking job has read Cashu
 * operation changes (cashu.md §5 "Into Payky's books"). A rowid is valid only
 * for this database file, which is why it lives here and not in the device
 * database: when this database is rebuilt from sync, the cursor goes with it
 * and the booking bootstraps again.
 */
export const _cashuBookingCursor = {
  id: CashuBookingCursorId,
  historyRowid: NonNegativeIntSchema,
} as const

/** Local indexes only: Linky defines none, and none of these sync. */
export const cashuIndexes = ((create) => [
  create("cashuProof_mint_state").on("cashuProof").columns(["mint", "state"]),
  create("cashuOperation_kind_status_createdAtSec")
    .on("cashuOperation")
    .columns(["kind", "status", "createdAtSec"]),
  create("cashuOperation_quoteId").on("cashuOperation").column("quoteId"),
]) satisfies IndexesConfig

export type ShardPointerRow = InferTable<typeof shardPointer>
export type LinkySettingRow = InferTable<typeof setting>
export type CashuProofRow = InferTable<typeof cashuProof>
export type CashuOperationRow = InferTable<typeof cashuOperation>
