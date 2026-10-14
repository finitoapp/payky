import type { Proof } from "@cashu/cashu-ts"
import { ok, type Result } from "@evolu/common"

import type {
  CashuShardStore,
  NewCashuProof,
} from "@/core/cashu/cashu-shard-store.ts"
import {
  callMint,
  checkProofStates,
  type LoadedCashuWallet,
  type MintFailure,
} from "@/core/cashu/cashu-wallet.ts"
import {
  CashuAmountSchema,
  type CashuOperationId,
  type CashuProofState,
  type KeysetId,
  KeysetIdSchema,
} from "@/core/modules/cashu/cashu-types.ts"

/**
 * Linky's NUT-09 restore (`linkshu/docs/restore.md`, `restore/internal/
 * scan.ts`) for one keyset: walk the derivation tree in batches until the
 * mint answers a gap of empty positions, keep only proofs the wallet does
 * not hold that the mint reports unspent, and store them `available`.
 */

/** Consecutive empty positions tolerated before a scan gives up. */
export const RESTORE_GAP_LIMIT = 300
/** Positions per restore request; cashu-ts issues one request per batch. */
export const RESTORE_BATCH_SIZE = 100

/** cashu-ts proofs as rows for the shard store; `null` when any is malformed. */
export const toNewCashuProofs = (
  proofs: ReadonlyArray<Proof>,
  loaded: Pick<LoadedCashuWallet, "mint">,
  state: CashuProofState,
  operationId: CashuOperationId | null
): ReadonlyArray<NewCashuProof> | null => {
  const rows: NewCashuProof[] = []
  for (const proof of proofs) {
    const keysetId = KeysetIdSchema.safeParse(proof.id)
    const amount = CashuAmountSchema.safeParse(Number(proof.amount))
    if (
      !keysetId.success ||
      !amount.success ||
      proof.secret === "" ||
      !/^(?:[0-9a-f]{2})+$/iu.test(proof.C)
    )
      return null
    rows.push({
      mint: loaded.mint,
      unit: "sat",
      keysetId: keysetId.data,
      amount: amount.data,
      secret: proof.secret,
      C: proof.C,
      dleq: proof.dleq === undefined ? null : JSON.stringify(proof.dleq),
      state,
      operationId,
    })
  }
  return rows
}

/** Proofs the wallet does not hold yet that the mint reports unspent. */
export const keepUnstoredUnspent = async (
  loaded: LoadedCashuWallet,
  store: CashuShardStore,
  proofs: ReadonlyArray<Proof>
): Promise<Result<ReadonlyArray<Proof>, MintFailure>> => {
  const known = new Set<string>(
    (await store.loadProofs()).map((row) => row.secret)
  )
  const fresh = proofs.filter((proof) => !known.has(proof.secret))
  const states = await checkProofStates(loaded, fresh)
  if (!states.ok) return states
  return ok(fresh.filter((_, index) => states.value[index] === "unspent"))
}

export interface KeysetRestore {
  readonly restoredAmount: number
  /** The first slot after the last one the mint has signed; null for none. */
  readonly nextCounter: number | null
}

export const restoreKeyset = async (
  loaded: LoadedCashuWallet,
  store: CashuShardStore,
  keysetId: KeysetId,
  from: number
): Promise<Result<KeysetRestore, MintFailure>> => {
  const scanned = await callMint(loaded.mint, () =>
    loaded.wallet.batchRestore(
      RESTORE_GAP_LIMIT,
      RESTORE_BATCH_SIZE,
      from,
      keysetId
    )
  )
  if (!scanned.ok) return scanned
  const last = scanned.value.lastCounterWithSignature
  const nextCounter =
    typeof last === "number" && Number.isFinite(last) ? last + 1 : null
  const kept = await keepUnstoredUnspent(loaded, store, scanned.value.proofs)
  // A failed state check imports nothing: an unconfirmed proof would show as
  // balance the wallet cannot spend. The counter still moves past the scan.
  const proofs = kept.ok ? kept.value : []
  const rows = toNewCashuProofs(proofs, loaded, "available", null) ?? []
  await store.insertProofs(rows)
  return ok({
    restoredAmount: rows.reduce((sum, row) => sum + row.amount, 0),
    nextCounter,
  })
}
