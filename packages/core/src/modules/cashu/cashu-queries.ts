import { type InferRow, type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { createQuery } from "../../evolu/schema.ts"
import type { PaymentId } from "../payment/payment-types.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import type {
  CashuOperationId,
  CashuProofId,
  KeysetId,
  MintUrl,
} from "./cashu-types.ts"
import {
  cashuCounterIdFor,
  cashuMintCacheIdFor,
  cashuMintTrustId,
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

/*
 * A proof's state is read from its cells (cashu/0024): `spent` once
 * `isSpent`, else `held` while `operationId` names a melt, else `available`.
 */

/** One mint's available proofs, oldest first. */
export const availableCashuProofsAtMintQuery = (mint: MintUrl) =>
  createQuery((db) =>
    db
      .selectFrom("cashuProof")
      .select(proofColumns)
      .where("isDeleted", "is not", sqliteTrue)
      .where("mintUrl", "=", mint)
      .where("isSpent", "is not", sqliteTrue)
      .where("operationId", "is", null)
      .orderBy("createdAt")
      .orderBy("id")
      .$narrowType<NotNullProof>()
  )
export type StoredCashuProof = InferRow<
  ReturnType<typeof availableCashuProofsAtMintQuery>
>

/** The unspent inputs a melt holds. */
export const heldCashuProofsOfOperationQuery = (
  operationId: CashuOperationId
) =>
  createQuery((db) =>
    db
      .selectFrom("cashuProof")
      .select(proofColumns)
      .where("isDeleted", "is not", sqliteTrue)
      .where("operationId", "=", operationId)
      .where("isSpent", "is not", sqliteTrue)
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
    .where("isSpent", "is not", sqliteTrue)
    .where("operationId", "is", null)
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
        "cashuMelt.expiresAt",
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
      "cashuTopup.quoteId",
    ])
    .where("cashuOperation.isDeleted", "is not", sqliteTrue)
    .where("cashuOperation.kind", "=", "topup")
    .where("cashuOperation.status", "=", "pending")
    // Settled, whatever a late write left in `status` (cashu/0022).
    .where("cashuOperation.settledAt", "is", null)
    .$narrowType<{ mintUrl: KyselyNotNull }>()
)

/**
 * Topups another device closed as contested (cashu/0029) on which this
 * device holds an attempt of its own no mark settled: its claim may have
 * been signed where no device looked before the close.
 */
export const contestedCashuTopupsWithOwnAttemptQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperation")
    .innerJoin(
      "cashuOperationAttempt",
      "cashuOperationAttempt.operationId",
      "cashuOperation.id"
    )
    .innerJoin(
      "_cashuOwnAttempt",
      "_cashuOwnAttempt.id",
      "cashuOperationAttempt.id"
    )
    .select(["cashuOperation.id"])
    .distinct()
    .where("cashuOperation.isDeleted", "is not", sqliteTrue)
    .where("cashuOperation.kind", "=", "topup")
    .where("cashuOperation.settledAt", "is not", null)
    .where("cashuOperationAttempt.isDeleted", "is not", sqliteTrue)
    .where("cashuOperationAttempt.isRejected", "is not", sqliteTrue)
    .where("cashuOperationAttempt.isContested", "is not", sqliteTrue)
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("cashuOperationAttempt as contested")
          .select("contested.id")
          .whereRef("contested.operationId", "=", "cashuOperation.id")
          .where("contested.isDeleted", "is not", sqliteTrue)
          .where("contested.isContested", "=", sqliteTrue)
      )
    )
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
    .select(["id", "createdAt"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("kind", "=", "melt")
    .where("status", "=", "pending")
    .where("settledAt", "is", null)
)

/**
 * The account's trusted mints (cashu/0016, cashu/0013): its one row, no row
 * on a device that has not synced it. `trustedCashuMintsOf` reads it.
 */
export const cashuTrustedMintsQuery = createQuery((db) =>
  db
    .selectFrom("cashuMintTrust")
    .select(["trustedMintsJson", "seedMintUrl"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("id", "=", cashuMintTrustId)
)

export const cashuCounterQuery = (mint: MintUrl, keysetId: KeysetId) =>
  createQuery((db) =>
    db
      .selectFrom("_cashuCounter")
      .select(["next", "orphansRecovered"])
      .where("id", "=", cashuCounterIdFor(mint, keysetId))
  )

/** A mint's info and keysets cached on this device (`_cashuMintCache`). */
export const cashuMintCacheQuery = (mint: MintUrl) =>
  createQuery((db) =>
    db
      .selectFrom("_cashuMintCache")
      .select(["infoJson", "keychainJson"])
      .where("id", "=", cashuMintCacheIdFor(mint))
      .where("isDeleted", "is not", sqliteTrue)
  )

/**
 * The first slot past every block on record at the keyset, any device's
 * (cashu/0031); null when there is none.
 */
export const cashuAttemptsEndQuery = (keysetId: KeysetId) =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperationAttempt")
      .select((eb) =>
        eb.fn.max<number | null>(eb("counter", "+", eb.ref("slots"))).as("end")
      )
      .where("isDeleted", "is not", sqliteTrue)
      .where("keysetId", "=", keysetId)
  )

/**
 * Every block at the keyset the mint did not refuse, with what its
 * operation is now (cashu/0031).
 */
export const cashuLiveAttemptsAtKeysetQuery = (keysetId: KeysetId) =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperationAttempt")
      .leftJoin(
        "cashuOperation",
        "cashuOperation.id",
        "cashuOperationAttempt.operationId"
      )
      .select([
        "cashuOperationAttempt.counter",
        "cashuOperationAttempt.slots",
        "cashuOperation.kind",
        "cashuOperation.status",
        "cashuOperation.settledAt",
      ])
      .where("cashuOperationAttempt.isDeleted", "is not", sqliteTrue)
      .where("cashuOperationAttempt.keysetId", "=", keysetId)
      .where("cashuOperationAttempt.isRejected", "is not", sqliteTrue)
      .$narrowType<{ counter: KyselyNotNull; slots: KyselyNotNull }>()
  )

/**
 * Blocks of other operations that share a slot with `from..to` at the keyset
 * and that the mint did not refuse, with what their operation is now
 * (cashu/0029).
 */
export const cashuOverlappingAttemptsQuery = ({
  operationId,
  keysetId,
  from,
  to,
}: {
  readonly operationId: CashuOperationId
  readonly keysetId: KeysetId
  readonly from: number
  readonly to: number
}) =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperationAttempt")
      .leftJoin(
        "cashuOperation",
        "cashuOperation.id",
        "cashuOperationAttempt.operationId"
      )
      .select([
        "cashuOperationAttempt.id",
        "cashuOperationAttempt.operationId",
        "cashuOperationAttempt.counter",
        "cashuOperationAttempt.slots",
        "cashuOperationAttempt.role",
        "cashuOperation.kind",
        "cashuOperation.status",
        "cashuOperation.settledAt",
      ])
      .where("cashuOperationAttempt.isDeleted", "is not", sqliteTrue)
      .where("cashuOperationAttempt.keysetId", "=", keysetId)
      .where("cashuOperationAttempt.operationId", "!=", operationId)
      .where("cashuOperationAttempt.isRejected", "is not", sqliteTrue)
      .where("cashuOperationAttempt.counter", "<", NonNegativeInteger(to))
      .where((eb) =>
        eb(
          eb(
            "cashuOperationAttempt.counter",
            "+",
            eb.ref("cashuOperationAttempt.slots")
          ),
          ">",
          NonNegativeInteger(from)
        )
      )
      .$narrowType<{
        operationId: KyselyNotNull
        counter: KyselyNotNull
        slots: KyselyNotNull
        role: KyselyNotNull
      }>()
  )

/**
 * Every NUT-13 reservation any device made for the operation (cashu/0029),
 * `ownId` set on this device's own, lowest slot first.
 */
export const cashuOperationAttemptsQuery = (operationId: CashuOperationId) =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperationAttempt")
      .leftJoin(
        "_cashuOwnAttempt",
        "_cashuOwnAttempt.id",
        "cashuOperationAttempt.id"
      )
      .select([
        "cashuOperationAttempt.id",
        "cashuOperationAttempt.keysetId",
        "cashuOperationAttempt.counter",
        "cashuOperationAttempt.slots",
        "cashuOperationAttempt.role",
        "cashuOperationAttempt.isRejected",
        "cashuOperationAttempt.isContested",
        "cashuOperationAttempt.createdAt",
        "_cashuOwnAttempt.id as ownId",
        "_cashuOwnAttempt.isFence as ownIsFence",
      ])
      .where("cashuOperationAttempt.isDeleted", "is not", sqliteTrue)
      .where("cashuOperationAttempt.operationId", "=", operationId)
      .orderBy("cashuOperationAttempt.counter")
      .$narrowType<{
        keysetId: KyselyNotNull
        counter: KyselyNotNull
        slots: KyselyNotNull
        role: KyselyNotNull
      }>()
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
