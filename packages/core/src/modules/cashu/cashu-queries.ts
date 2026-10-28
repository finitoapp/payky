import { type InferRow, type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { createQuery } from "../../evolu/schema.ts"
import type { PaymentId } from "../payment/payment-types.ts"
import type {
  CashuOperationId,
  CashuProofId,
  CashuProofState,
  KeysetId,
  MintUrl,
} from "./cashu-types.ts"
import {
  cashuClaimAttemptIdFor,
  cashuCounterIdFor,
  cashuTokenArrivalIdFor,
} from "./cashu-utils.ts"

/*
 * Read models of Payky's Cashu wallet (cashu/0012). Payky is the only writer,
 * so every query reads live rows only and none merges copies.
 */

const proofColumns = [
  "id",
  "mintUrl",
  "keysetId",
  "amount",
  "secret",
  "c",
  "createdAt",
] as const

type NotNullProof = {
  mintUrl: KyselyNotNull
  keysetId: KyselyNotNull
  amount: KyselyNotNull
  secret: KyselyNotNull
  c: KyselyNotNull
}

/** One mint's proofs in one state, oldest first. */
export const cashuProofsAtMintQuery = (mint: MintUrl, state: CashuProofState) =>
  createQuery((db) =>
    db
      .selectFrom("cashuProof")
      .select(proofColumns)
      .where("isDeleted", "is not", sqliteTrue)
      .where("mintUrl", "=", mint)
      .where("state", "=", state)
      .orderBy("createdAt")
      .orderBy("id")
      .$narrowType<NotNullProof>()
  )
export type StoredCashuProof = InferRow<
  ReturnType<typeof cashuProofsAtMintQuery>
>

/** The inputs a melt holds or spent. */
export const cashuProofsOfOperationQuery = (
  operationId: CashuOperationId,
  state: CashuProofState
) =>
  createQuery((db) =>
    db
      .selectFrom("cashuProof")
      .select(proofColumns)
      .where("isDeleted", "is not", sqliteTrue)
      .where("operationId", "=", operationId)
      .where("state", "=", state)
      .$narrowType<NotNullProof>()
  )

/** Which of these proofs the wallet holds already, in any state. */
export const storedCashuProofIdsQuery = (ids: ReadonlyArray<CashuProofId>) =>
  createQuery((db) =>
    db
      .selectFrom("cashuProof")
      .select(["id"])
      .where("id", "in", ids.length === 0 ? [null] : ids)
  )

/**
 * The stored proofs of these keysets, oldest first: a keyset belongs to the
 * mint of its oldest proof (`foreignKeysetOwner`).
 */
export const cashuProofsOfKeysetsQuery = (keysetIds: ReadonlyArray<KeysetId>) =>
  createQuery((db) =>
    db
      .selectFrom("cashuProof")
      .select(["mintUrl", "keysetId", "createdAt"])
      .where("isDeleted", "is not", sqliteTrue)
      .where("keysetId", "in", keysetIds.length === 0 ? [null] : keysetIds)
      .orderBy("createdAt")
      .orderBy("mintUrl")
      .$narrowType<{ mintUrl: KyselyNotNull; keysetId: KyselyNotNull }>()
  )

/** The available balance per mint. */
export const cashuBalancesQuery = createQuery((db) =>
  db
    .selectFrom("cashuProof")
    .select((eb) => ["mintUrl", eb.fn.sum<number>("amount").as("balance")])
    .where("isDeleted", "is not", sqliteTrue)
    .where("state", "=", "available")
    .groupBy("mintUrl")
    .orderBy("mintUrl")
    .$narrowType<{ mintUrl: KyselyNotNull; balance: KyselyNotNull }>()
)

const operationColumns = [
  "cashuOperation.id",
  "cashuOperation.kind",
  "cashuOperation.status",
  "cashuOperation.mintUrl",
  "cashuOperation.amount",
  "cashuOperation.keysetId",
  "cashuOperation.counter",
  "cashuOperation.settledAt",
  "cashuOperation.createdAt",
] as const

type NotNullOperation = {
  kind: KyselyNotNull
  status: KyselyNotNull
  mintUrl: KyselyNotNull
  amount: KyselyNotNull
}

export const cashuOperationQuery = (id: CashuOperationId) =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperation")
      .select(operationColumns)
      .where("cashuOperation.isDeleted", "is not", sqliteTrue)
      .where("cashuOperation.id", "=", id)
      .$narrowType<NotNullOperation>()
  )
export type CashuOperationSnapshot = InferRow<
  ReturnType<typeof cashuOperationQuery>
>

export const cashuTopupQuery = (id: CashuOperationId) =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperation")
      .innerJoin("cashuTopup", "cashuTopup.id", "cashuOperation.id")
      .select([
        ...operationColumns,
        "cashuTopup.quoteId",
        "cashuTopup.lnInvoice",
        "cashuTopup.expiresAt",
        "cashuTopup.locked",
        "cashuTopup.purpose",
      ])
      .where("cashuOperation.isDeleted", "is not", sqliteTrue)
      .where("cashuOperation.id", "=", id)
      .where("cashuOperation.kind", "=", "topup")
      .$narrowType<
        NotNullOperation & {
          quoteId: KyselyNotNull
          lnInvoice: KyselyNotNull
          purpose: KyselyNotNull
        }
      >()
  )
export type CashuTopupRow = InferRow<ReturnType<typeof cashuTopupQuery>>

export const cashuReceiveQuery = (id: CashuOperationId) =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperation")
      .innerJoin("cashuReceive", "cashuReceive.id", "cashuOperation.id")
      .select([
        ...operationColumns,
        "cashuReceive.tokenText",
        "cashuReceive.fee",
      ])
      .where("cashuOperation.isDeleted", "is not", sqliteTrue)
      .where("cashuOperation.id", "=", id)
      .where("cashuOperation.kind", "=", "receive")
      .$narrowType<
        NotNullOperation & { tokenText: KyselyNotNull; fee: KyselyNotNull }
      >()
  )
export type CashuReceiveRow = InferRow<ReturnType<typeof cashuReceiveQuery>>

export const cashuMeltQuery = (id: CashuOperationId) =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperation")
      .innerJoin("cashuMelt", "cashuMelt.id", "cashuOperation.id")
      .select([
        ...operationColumns,
        "cashuMelt.quoteId",
        "cashuMelt.lnInvoice",
        "cashuMelt.feeReserve",
        "cashuMelt.inputsTotal",
        "cashuMelt.purpose",
      ])
      .where("cashuOperation.isDeleted", "is not", sqliteTrue)
      .where("cashuOperation.id", "=", id)
      .where("cashuOperation.kind", "=", "melt")
      .$narrowType<
        NotNullOperation & {
          quoteId: KyselyNotNull
          feeReserve: KyselyNotNull
          inputsTotal: KyselyNotNull
        }
      >()
  )
export type CashuMeltRow = InferRow<ReturnType<typeof cashuMeltQuery>>

/** Topups still waiting for their quote to be paid and claimed. */
export const pendingCashuTopupsQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperation")
    .innerJoin("cashuTopup", "cashuTopup.id", "cashuOperation.id")
    .select([
      "cashuOperation.id",
      "cashuOperation.mintUrl",
      "cashuOperation.createdAt",
      "cashuTopup.purpose",
    ])
    .where("cashuOperation.isDeleted", "is not", sqliteTrue)
    .where("cashuOperation.kind", "=", "topup")
    .where("cashuOperation.status", "=", "pending")
    .$narrowType<{ mintUrl: KyselyNotNull; purpose: KyselyNotNull }>()
)

/** The move a melt pays for, when it is a move's source. */
export const cashuMoveByMeltQuery = (meltOperationId: CashuOperationId) =>
  createQuery((db) =>
    db
      .selectFrom("cashuMove")
      .select(["topupOperationId", "sourceMintUrl"])
      .where("isDeleted", "is not", sqliteTrue)
      .where("meltOperationId", "=", meltOperationId)
      .$narrowType<{
        topupOperationId: KyselyNotNull
        sourceMintUrl: KyselyNotNull
      }>()
  )

/** Melts sent whose outcome the mint has not told yet. */
export const pendingCashuMeltsQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperation")
    .select(["id"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("kind", "=", "melt")
    .where("status", "=", "pending")
)

/**
 * The trusted mints (cashu/0017), each with what picks the default
 * (cashu/0013); `pickDefaultCashuMint` and `orderTrustedCashuMints` read them.
 */
export const cashuTrustedMintsQuery = createQuery((db) =>
  db
    .selectFrom("cashuMint")
    .select(["mintUrl", "defaultedAt", "createdAt"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("mintUrl", "is not", null)
    .$narrowType<{ mintUrl: KyselyNotNull }>()
    .orderBy("defaultedAt", "desc")
    .orderBy("createdAt", "desc")
    .orderBy("mintUrl")
)

/**
 * The newest `defaultedAt` of any mint, untrusted ones included, so a new
 * choice is later than every earlier one (cashu/0013).
 */
export const cashuNewestDefaultedAtQuery = createQuery((db) =>
  db
    .selectFrom("cashuMint")
    .select((eb) => eb.fn.max("defaultedAt").as("newest"))
)

export const cashuCounterQuery = (mint: MintUrl, keysetId: KeysetId) =>
  createQuery((db) =>
    db
      .selectFrom("_cashuCounter")
      .select(["next"])
      .where("id", "=", cashuCounterIdFor(mint, keysetId))
  )

export const cashuClaimAttemptQuery = (operationId: CashuOperationId) =>
  createQuery((db) =>
    db
      .selectFrom("_cashuClaimAttempt")
      .select(["counter"])
      .where("id", "=", cashuClaimAttemptIdFor(operationId))
  )

/** What the wait screen shows of a token sent for the payment. */
export const cashuTokenArrivalQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("_cashuTokenArrival")
      .select(["mintUrl", "amount", "fee", "state", "failure"])
      .where("id", "=", cashuTokenArrivalIdFor(paymentId))
      .$narrowType<{
        mintUrl: KyselyNotNull
        amount: KyselyNotNull
        state: KyselyNotNull
      }>()
  )

/** How many operations the wallet holds, for the debug card. */
export const cashuOperationCountQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperation")
    .select((eb) => [eb.fn.countAll<number>().as("count")])
    .where("isDeleted", "is not", sqliteTrue)
)
