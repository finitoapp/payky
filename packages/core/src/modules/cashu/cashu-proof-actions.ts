import type { AmountLike, Proof, ProofLike } from "@cashu/cashu-ts"
import { type MutationOptions, ok, type Result, type Task } from "@evolu/common"
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
import type { NonNegativeInteger, TimestampMs } from "../shared/schema.ts"
import type { MintFailure } from "./cashu-errors.ts"
import { storedCashuProofIdsQuery } from "./cashu-queries.ts"
import {
  type CashuAmount,
  CashuAmountSchema,
  type CashuOperationId,
  type CashuOperationKind,
  type CashuOperationStatus,
  type CashuProofId,
  type CashuProofState,
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

/** cashu-ts proofs as rows; `null` when any is malformed. */
export const toNewCashuProofs = (
  proofs: ReadonlyArray<Proof>,
  mint: MintUrl
): ReadonlyArray<NewCashuProof> | null => {
  const rows = proofs.map((proof): NewCashuProof | null => {
    const keysetId = KeysetIdSchema.safeParse(proof.id)
    const amount = CashuAmountSchema.safeParse(amountToNumber(proof.amount))
    if (
      !keysetId.success ||
      !amount.success ||
      proof.secret === "" ||
      !/^(?:[0-9a-f]{2})+$/iu.test(proof.C)
    )
      return null
    const dleq =
      proof.dleq === undefined ? null : z.safeEncode(cashuDleqCodec, proof.dleq)
    return {
      id: cashuProofIdFor(proof.secret),
      mintUrl: mint,
      keysetId: keysetId.data,
      amount: amount.data,
      secret: proof.secret,
      c: proof.C,
      dleq: dleq?.success === true ? dleq.data : null,
    }
  })
  return rows.every((row) => row !== null) ? rows : null
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

/** Upserts by id, so a proof stored before is moved, never duplicated. */
export const upsertCashuProofRows = (
  evolu: Evolu,
  proofs: ReadonlyArray<NewCashuProof>,
  {
    state,
    operationId,
  }: {
    readonly state: CashuProofState
    readonly operationId: CashuOperationId | null
  },
  options?: MutationOptions
): void => {
  for (const proof of proofs)
    evolu.upsert("cashuProof", { ...proof, state, operationId }, options)
}

export const setCashuProofStates = (
  evolu: Evolu,
  ids: ReadonlyArray<CashuProofId>,
  {
    state,
    operationId,
  }: {
    readonly state: CashuProofState
    readonly operationId?: CashuOperationId | null
  },
  options?: MutationOptions
): void => {
  for (const id of ids)
    evolu.update(
      "cashuProof",
      removeUndefinedValues({ id, state, operationId }),
      options
    )
}

/** A new operation root; its detail row is the kind's own action's. */
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
  evolu.upsert(
    "cashuOperation",
    {
      ...operation,
      counter: null,
      error: null,
      settledAt: null,
    },
    options
  )
}

export const updateCashuOperation = (
  evolu: Evolu,
  id: CashuOperationId,
  patch: {
    readonly status?: CashuOperationStatus
    readonly keysetId?: KeysetId
    readonly counter?: NonNegativeInteger
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
