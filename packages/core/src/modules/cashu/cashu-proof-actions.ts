import type { AmountLike, Proof, ProofLike } from "@cashu/cashu-ts"
import {
  type ConsoleDep,
  type MutationOptions,
  ok,
  type Result,
  sqliteTrue,
  type Task,
} from "@evolu/common"
import { z } from "zod"
import {
  amountToNumber,
  type CashuWalletDep,
  checkProofStates,
  type LoadedCashuWallet,
} from "../../cashu/cashu-wallet.ts"
import type { Evolu } from "../../evolu/schema.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { removeUndefinedValues } from "../shared/evolu-utils.ts"
import type { TimestampMs } from "../shared/schema.ts"
import type { MintFailure } from "./cashu-errors.ts"
import { storedCashuProofIdsQuery } from "./cashu-queries.ts"
import {
  type CashuAmount,
  CashuAmountSchema,
  type CashuOperationId,
  type CashuOperationKind,
  type CashuOperationStatus,
  type CashuProofId,
  type KeysetId,
  KeysetIdSchema,
  type MintUrl,
} from "./cashu-types.ts"
import { cashuDleqCodec, cashuProofIdFor } from "./cashu-utils.ts"

/**
 * The plain writes of proofs and operation roots, taking the caller's
 * `MutationOptions` so one state transition — the proofs and the status
 * together — is one batch (cashu/0012).
 */

export interface NewCashuProof {
  readonly id: CashuProofId
  readonly mintUrl: MintUrl
  readonly keysetId: KeysetId
  readonly amount: CashuAmount
  readonly secret: string
  /** The NUT-00 signature point. */
  readonly c: string
  readonly dleq: string | null
}

/**
 * cashu-ts proofs as rows. A proof the schema cannot hold, of no amount,
 * no secret, a signature point or keyset id that is not hex, is one no mint
 * would take back: it is left out and logged, and never takes the valid
 * proofs signed with it along.
 */
export const toNewCashuProofs = (
  { console }: ConsoleDep,
  proofs: ReadonlyArray<Proof>,
  mint: MintUrl
): ReadonlyArray<NewCashuProof> => {
  const rows: NewCashuProof[] = []
  for (const proof of proofs) {
    const keysetId = KeysetIdSchema.safeParse(proof.id)
    const amount = CashuAmountSchema.safeParse(amountToNumber(proof.amount))
    if (
      !keysetId.success ||
      !amount.success ||
      proof.secret === "" ||
      !/^(?:[0-9a-f]{2})+$/iu.test(proof.C)
    ) {
      console.warn("Left out a proof the mint signed malformed.", {
        mint,
        keysetId: proof.id,
        amount: amountToNumber(proof.amount),
      })
      continue
    }
    const dleq =
      proof.dleq === undefined ? null : z.safeEncode(cashuDleqCodec, proof.dleq)
    rows.push({
      id: cashuProofIdFor(proof.secret),
      mintUrl: mint,
      keysetId: keysetId.data,
      amount: amount.data,
      secret: proof.secret,
      c: proof.C,
      dleq: dleq?.success === true ? dleq.data : null,
    })
  }
  return rows
}

/** What a cashu-ts call takes as inputs. */
export const toWalletProofs = (
  proofs: ReadonlyArray<{
    readonly keysetId: string
    readonly amount: number
    readonly secret: string
    readonly c: string
  }>
): Array<ProofLike> =>
  proofs.map((proof) => ({
    id: proof.keysetId,
    amount: proof.amount,
    secret: proof.secret,
    C: proof.c,
  }))

export const sumCashuAmounts = (
  proofs: ReadonlyArray<{ readonly amount: AmountLike }>
): number =>
  proofs.reduce((sum, proof) => sum + amountToNumber(proof.amount), 0)

/**
 * Stores proofs by their identity alone, cells every device writes alike
 * (cashu/0024). A proof stored before keeps the hold and the spend another
 * device may have written, so a restore or a reclaim never undoes them; a
 * proof new here is `available`.
 */
export const upsertCashuProofIdentities = (
  evolu: Evolu,
  proofs: ReadonlyArray<NewCashuProof>,
  options?: MutationOptions
): void => {
  for (const proof of proofs) evolu.upsert("cashuProof", proof, options)
}

/** The melt holds these proofs: its inputs while it is in flight. */
export const holdCashuProofs = (
  evolu: Evolu,
  ids: ReadonlyArray<CashuProofId>,
  operationId: CashuOperationId,
  options?: MutationOptions
): void => {
  for (const id of ids) evolu.update("cashuProof", { id, operationId }, options)
}

/** The melt holding these proofs lets them go, back to the balance. */
export const releaseCashuProofs = (
  evolu: Evolu,
  ids: ReadonlyArray<CashuProofId>,
  options?: MutationOptions
): void => {
  for (const id of ids)
    evolu.update("cashuProof", { id, operationId: null }, options)
}

/** Spent for good: no later write of the row brings them back (cashu/0024). */
export const spendCashuProofs = (
  evolu: Evolu,
  ids: ReadonlyArray<CashuProofId>,
  options?: MutationOptions
): void => {
  for (const id of ids)
    evolu.update("cashuProof", { id, isSpent: sqliteTrue }, options)
}

/**
 * A new operation root; its detail row is the kind's own action's. It leaves
 * `settledAt` to the batch that completes the operation: another device may
 * have written it already, and its write must not be cleared (cashu/0022).
 * The NUT-13 slots go on record as attempts (cashu/0029).
 */
export const upsertCashuOperationRow = (
  evolu: Evolu,
  operation: {
    readonly id: CashuOperationId
    readonly kind: CashuOperationKind
    readonly status: CashuOperationStatus
    readonly mintUrl: MintUrl
    readonly amount: CashuAmount
    readonly keysetId: KeysetId | null
  },
  options?: MutationOptions
): void => {
  evolu.upsert("cashuOperation", { ...operation, error: null }, options)
}

export const updateCashuOperation = (
  evolu: Evolu,
  id: CashuOperationId,
  patch: {
    readonly status?: CashuOperationStatus
    readonly error?: string | null
    readonly settledAt?: TimestampMs
  },
  options?: MutationOptions
): void => {
  evolu.update(
    "cashuOperation",
    removeUndefinedValues({ id, ...patch }),
    options
  )
}

/** Proofs the wallet does not hold yet that the mint reports unspent. */
export const keepUnstoredUnspent =
  (
    loaded: LoadedCashuWallet,
    proofs: ReadonlyArray<Proof>
  ): Task<ReadonlyArray<Proof>, MintFailure, CashuWalletDep & EvoluDep> =>
  async (run) => {
    const stored = new Set<string>(
      (
        await run.deps.evolu.loadQuery(
          storedCashuProofIdsQuery(
            proofs.map((proof) => cashuProofIdFor(proof.secret))
          )
        )
      ).map((row) => row.id)
    )
    const fresh = proofs.filter(
      (proof) => !stored.has(cashuProofIdFor(proof.secret))
    )
    const states: Result<
      ReadonlyArray<string>,
      MintFailure
    > = await checkProofStates(loaded, fresh)
    if (!states.ok) return states
    return ok(fresh.filter((_, index) => states.value[index] === "unspent"))
  }
