import { IdBytes, idBytesToId, ok, sqliteFalse, type Task } from "@evolu/common"
import { hexToBytes } from "@noble/hashes/utils.js"

import type { CashuShardStoreDep } from "@/core/cashu/cashu-shard-store.ts"
import {
  type CashuWalletDep,
  loadCashuWallet,
} from "@/core/cashu/cashu-wallet.ts"
import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { cashuAccountQuery } from "@/core/modules/account/account-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  computeAccountTransactionRows,
  upsertAccountTransactionRows,
} from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { bookedCashuOperationIdsQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import {
  type CashuOperationCopy,
  cashuBookingCursorId,
  cashuBookingCursorQuery,
  changedCashuOperationIdsQuery,
  evoluHistoryMaxRowidQuery,
} from "@/core/modules/cashu/cashu-queries.ts"
import {
  CashuOperationId,
  NonNegativeIntSchema,
} from "@/core/modules/cashu/cashu-types.ts"
import {
  loadAutomaticReconciliationClaimForNewAccountTransaction,
  loadBillClosedAtForPayment,
  upsertReconciliationClaimRows,
} from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import type {
  DeviceEvoluDep,
  EvoluDep,
} from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import {
  IntegerSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

/**
 * Into Payky's books (cashu.md §5, cashu/0005): every incoming Cashu
 * operation — each `done` `receive` and `topup` in the shared wallet,
 * whoever performed it — becomes one `accountTransaction` of kind `cashu`,
 * with the automatic claim of the payment that holds its quote or receive id.
 * Outgoing operations are not booked here.
 *
 * - Write only what is missing: an upsert of unchanged values is still a
 *   new mutation that syncs, so booked operations are never rewritten.
 * - Read only what is new: a cursor over `evolu_history` rowids, the order
 *   changes arrived on this device. A time cursor would miss an operation a
 *   week-offline device brings in under a week-old time.
 * - Bootstrap when there is no cursor: the last month only.
 */

export type CashuBookingDeps = EvoluDep &
  EvoluOwnerIdDep &
  DateDep &
  CashuShardStoreDep &
  CashuWalletDep &
  DeviceEvoluDep

/** How far back a new device books an existing wallet's incoming money. */
const BOOTSTRAP_LOOKBACK_SECONDS = 31 * 24 * 60 * 60

const isIncomingDone = (operation: CashuOperationCopy): boolean =>
  operation.status === "done" &&
  (operation.kind === "topup" || operation.kind === "receive")

/**
 * The sats that reached the wallet: a topup's amount, or a token's face value
 * after the mint's NUT-02 input fee (decision 5d). Null when the fee cannot be
 * known yet (the mint is unreachable); the operation is booked on a later run.
 */
const receivedSats = async (
  run: Parameters<Task<unknown, never, CashuBookingDeps>>[0],
  operation: CashuOperationCopy
): Promise<number | null> => {
  if (operation.kind === "topup" || operation.tokenText === null)
    return operation.amount
  const loaded = await run(loadCashuWallet(operation.mint))
  if (!loaded.ok) return null
  try {
    const token = loaded.value.wallet.decodeToken(operation.tokenText)
    const fee = Number(loaded.value.wallet.getFeesForProofs(token.proofs))
    return Math.max(0, operation.amount - fee)
  } catch {
    return operation.amount
  }
}

const bookOperation = async (
  run: Parameters<Task<unknown, never, CashuBookingDeps>>[0],
  accountId: AccountId,
  operation: CashuOperationCopy
): Promise<"booked" | "deferred" | "nothing"> => {
  const amount = await receivedSats(run, operation)
  if (amount === null) return "deferred"
  if (amount <= 0) return "nothing"
  const input = {
    accountId,
    amount: IntegerSchema.decode(amount),
    currency: "BTC" as const,
    occurredAt: TimestampMsSchema.decode(operation.createdAtSec * 1000),
    note: null,
    internalTransferGroupId: null,
    source: { deviceId: null, source: "auto" as const },
    cashu: {
      cashuOperationId: operation.id,
      quoteId: operation.quoteId,
      mintUrl: operation.mint,
    },
  }
  const computed = computeAccountTransactionRows(input, run.deps.date.now())
  const claim = await run.ok(
    loadAutomaticReconciliationClaimForNewAccountTransaction(input, computed.id)
  )
  const billClosing =
    claim === null
      ? null
      : await run.ok(
          loadBillClosedAtForPayment(claim.paymentId, {
            id: computed.id,
            amount,
            currency: "BTC",
          })
        )
  await runMutationWithCompletion((options) => {
    const mutationOptions = { ...options, ownerId: run.deps.evoluOwnerId }
    upsertAccountTransactionRows(run.deps.evolu, computed, mutationOptions)
    if (claim !== null)
      upsertReconciliationClaimRows(
        run.deps.evolu,
        claim,
        billClosing,
        mutationOptions
      )
  })
  return "booked"
}

const unbooked = async (
  deps: EvoluDep,
  operations: ReadonlyArray<CashuOperationCopy>
): Promise<ReadonlyArray<CashuOperationCopy>> => {
  if (operations.length === 0) return []
  const booked = new Set<string>(
    (
      await deps.evolu.loadQuery(
        bookedCashuOperationIdsQuery(operations.map((op) => op.id))
      )
    ).flatMap((row) =>
      row.cashuOperationId === null ? [] : [row.cashuOperationId]
    )
  )
  return operations.filter((operation) => !booked.has(operation.id))
}

const writeCursor = (deps: EvoluDep & EvoluOwnerIdDep, rowid: number) =>
  runMutationWithCompletion((options) =>
    deps.evolu.upsert(
      "_cashuBookingCursor",
      {
        id: cashuBookingCursorId,
        historyRowid: NonNegativeIntSchema.parse(rowid),
        isDeleted: sqliteFalse,
      },
      { ...options, ownerId: deps.evoluOwnerId }
    )
  )

const idFromHex = (hex: string): CashuOperationId | null => {
  const bytes = IdBytes.fromUnknown(hexToBytes(hex.toLowerCase()))
  if (!bytes.ok) return null
  const parsed = CashuOperationId.safeParse(idBytesToId(bytes.value))
  return parsed.success ? parsed.data : null
}

/**
 * One booking run. Waits for Linky's owners to hydrate first, so a fresh
 * device does not take a partial sync for the wallet's history.
 */
export const bookCashuOperations: Task<
  { readonly booked: number },
  never,
  CashuBookingDeps
> = async (run) => {
  const { evolu, cashuShardStore: store } = run.deps
  const [account] = await evolu.loadQuery(cashuAccountQuery)
  if (account === undefined) return ok({ booked: 0 })

  await store.whenHydrated(run.signal)
  const [cursorRow] = await evolu.loadQuery(cashuBookingCursorQuery)
  // Read before the scan: a change arriving during it lands above the new
  // cursor and is picked up by the next run.
  const [maxRow] = await evolu.loadQuery(evoluHistoryMaxRowidQuery)
  const maxRowid = Number(maxRow?.maxRowid ?? 0)

  let candidates: ReadonlyArray<CashuOperationCopy>
  if (
    cursorRow?.historyRowid === undefined ||
    cursorRow.historyRowid === null
  ) {
    const since =
      Math.floor(run.deps.date.now().getTime() / 1000) -
      BOOTSTRAP_LOOKBACK_SECONDS
    candidates = (await store.loadOperations()).filter(
      (operation) =>
        isIncomingDone(operation) && operation.createdAtSec >= since
    )
  } else {
    if (maxRowid <= cursorRow.historyRowid) return ok({ booked: 0 })
    const changed = await evolu.loadQuery(
      changedCashuOperationIdsQuery(
        cursorRow.historyRowid,
        maxRowid,
        await store.shardOwnerIds()
      )
    )
    const loaded = await Promise.all(
      changed.flatMap((row) => {
        const id = row.idHex === null ? null : idFromHex(row.idHex)
        return id === null ? [] : [store.loadOperation(id)]
      })
    )
    candidates = loaded.filter(
      (operation): operation is CashuOperationCopy =>
        operation !== null && isIncomingDone(operation)
    )
  }

  let booked = 0
  let deferred = false
  for (const operation of await unbooked(run.deps, candidates)) {
    const outcome = await bookOperation(run, account.id, operation)
    if (outcome === "booked") booked += 1
    if (outcome === "deferred") deferred = true
  }
  // A deferred operation keeps the cursor where it was: the next run reads
  // the same range again, and what is booked already is skipped.
  if (!deferred) await writeCursor(run.deps, maxRowid)
  return ok({ booked })
}
