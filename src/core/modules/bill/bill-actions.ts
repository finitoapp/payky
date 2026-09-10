import {
  err,
  type InsertValues,
  type MutationOptions,
  ok,
  type Task,
  type UpdateValues,
  type UpsertValues,
} from "@evolu/common"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { BillRow, bill } from "@/core/modules/bill/bill.ts"
import type {
  BillLineRow,
  billLine,
} from "@/core/modules/bill-line/bill-line.ts"
import {
  appendBillLine,
  appendBillLines,
  insertBillLineRows,
  loadCalculatedBillLineSummaries,
} from "@/core/modules/bill-line/bill-line-actions.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { calculateBillLineSummaries } from "@/core/modules/bill-line/bill-line-utils.ts"
import { catalogItemByIdQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { ItemRow, item } from "@/core/modules/item/item.ts"
import { upsertItemSnapshot } from "@/core/modules/item/item-actions.ts"
import {
  createCatalogItemSnapshot,
  createStandaloneItemSnapshot,
} from "@/core/modules/item/item-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  type ItemLineType,
  NonNegativeInteger,
  PositiveInteger,
  PositiveNumber,
  type TimestampMs,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import {
  claimedPaymentsByBillIdQuery,
  claimedTransactionsByBillIdQuery,
  paymentsByBillIdQuery,
} from "./bill-coverage-queries.ts"
import {
  allBillDisplayNumbersQuery,
  billByIdQuery,
  openBillsQuery,
} from "./bill-queries.ts"
import type { BillId } from "./bill-types.ts"
import {
  type BillCoverage,
  type BillStatus,
  calculateClaimedSum,
  claimedPaymentIdSet,
  deriveBillCoverage,
  deriveBillStatus,
  hasPendingPayment,
} from "./bill-utils.ts"

export interface BillWithItems {
  readonly bill: BillRow
  readonly items: ReadonlyArray<BillLineSummary>
}

const createBillNotFoundError = defineError("BillNotFound")<{
  readonly id: BillId
}>()
export type BillNotFoundError = ReturnType<typeof createBillNotFoundError>

const createBillNotOpenError = defineError("BillNotOpen")<{
  readonly id: BillId
  readonly status: BillStatus
}>()
export type BillNotOpenError = ReturnType<typeof createBillNotOpenError>

const createBillLockedError = defineError("BillLocked")<{
  readonly id: BillId
}>()
export type BillLockedError = ReturnType<typeof createBillLockedError>

const createBillUnderpaidError = defineError("BillUnderpaid")<{
  readonly id: BillId
  readonly billTotal: NonNegativeInteger
  readonly claimedSum: NonNegativeInteger
}>()
export type BillUnderpaidError = ReturnType<typeof createBillUnderpaidError>

const createBillNotCanceledError = defineError("BillNotCanceled")<{
  readonly id: BillId
}>()
export type BillNotCanceledError = ReturnType<typeof createBillNotCanceledError>

const createCatalogItemNotFoundError = defineError("CatalogItemNotFound")<{
  readonly id: CatalogItemId
}>()
export type CatalogItemNotFoundError = ReturnType<
  typeof createCatalogItemNotFoundError
>

const createBillLineSummaryMissingError = defineError(
  "BillLineSummaryMissing"
)<{
  readonly billId: BillId
  readonly itemId: BillLineSummary["itemId"]
  readonly lineType: BillLineSummary["type"]
}>()
export type BillLineSummaryMissingError = ReturnType<
  typeof createBillLineSummaryMissingError
>

export type AddBillLineError =
  | CatalogItemNotFoundError
  | BillLineSummaryMissingError
  | BillNotFoundError
  | BillNotOpenError
  | BillLockedError

export type SplitBillError =
  | BillNotFoundError
  | BillNotOpenError
  | BillLockedError

export const billNotFound = (id: BillId): BillNotFoundError =>
  createBillNotFoundError({ id })

export const billNotOpen = (id: BillId, status: BillStatus): BillNotOpenError =>
  createBillNotOpenError({ id, status })

export const billLocked = (id: BillId): BillLockedError =>
  createBillLockedError({ id })

export const billUnderpaid = (
  id: BillId,
  billTotal: NonNegativeInteger,
  claimedSum: NonNegativeInteger
): BillUnderpaidError => createBillUnderpaidError({ id, billTotal, claimedSum })

export const billNotCanceled = (id: BillId): BillNotCanceledError =>
  createBillNotCanceledError({ id })

export const catalogItemNotFound = (
  id: CatalogItemId
): CatalogItemNotFoundError => createCatalogItemNotFoundError({ id })

const billLineSummaryMissing = (input: {
  readonly billId: BillId
  readonly itemId: BillLineSummary["itemId"]
  readonly lineType: BillLineSummary["type"]
}): BillLineSummaryMissingError => createBillLineSummaryMissingError(input)

export const loadBill =
  (idValue: BillId): Task<BillRow, BillNotFoundError, EvoluDep> =>
  async (run) =>
    getFirstOr(
      await run.deps.evolu.loadQuery(billByIdQuery(idValue)),
      billNotFound(idValue)
    )

export interface BillCoverageSummary {
  readonly billTotal: NonNegativeInteger
  readonly claimedSum: NonNegativeInteger
  readonly coverage: BillCoverage
}

/**
 * Shared "bill's line-item total + its claimed transactions" load behind
 * `loadBillCoverage` and `loadBillClosedAtIfCovered`.
 */
const loadBillTotalAndClaimedSum =
  (
    billId: BillId
  ): Task<
    {
      readonly billTotal: NonNegativeInteger
      readonly claimedTransactions: ReadonlyArray<{
        readonly paymentId: PaymentId
        readonly accountTransactionId: AccountTransactionId
        readonly amount: number
        readonly tipAmount: NonNegativeInteger
      }>
    },
    never,
    EvoluDep
  > =>
  async (run) => {
    const [summaries, claimedTransactions] = await Promise.all([
      run.ok(loadCalculatedBillLineSummaries(billId)),
      run.deps.evolu.loadQuery(claimedTransactionsByBillIdQuery(billId)),
    ])

    return ok({
      billTotal: NonNegativeInteger(
        summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
      ),
      claimedTransactions,
    })
  }

/**
 * Compares a bill's line-item total against what has actually been claimed
 * as paid across all of its payments, independent of `bill.status`. See
 * docs/bill-payment-states.md.
 */
export const loadBillCoverage =
  (billId: BillId): Task<BillCoverageSummary, never, EvoluDep> =>
  async (run) => {
    const { billTotal, claimedTransactions } = await run.ok(
      loadBillTotalAndClaimedSum(billId)
    )
    const claimedSum = calculateClaimedSum(claimedTransactions)

    return ok({
      billTotal,
      claimedSum,
      coverage: deriveBillCoverage(billTotal, claimedSum),
    })
  }

interface BillStatusSnapshot {
  readonly bill: BillRow
  readonly status: BillStatus
  readonly coverage: BillCoverage
  readonly billTotal: NonNegativeInteger
  readonly claimedSum: NonNegativeInteger
  /** Whether at least one payment on this bill has an active claim. */
  readonly hasActiveClaim: boolean
}

/**
 * Loads a bill together with its live-derived status and coverage — the
 * one place that composes `deriveBillStatus` from the bill row's
 * `canceledAt`/`confirmedClosedAt` and its payments' coverage. Every guard
 * below reads through this instead of any stored field, so a bill's
 * editability/cancelability is always computed fresh. See
 * docs/bill-payment-states.md.
 */
const loadBillStatusSnapshot =
  (billId: BillId): Task<BillStatusSnapshot, BillNotFoundError, EvoluDep> =>
  async (run) => {
    const billResult = await run(loadBill(billId))
    if (!billResult.ok) return billResult

    const { billTotal, claimedTransactions } = await run.ok(
      loadBillTotalAndClaimedSum(billId)
    )
    const claimedSum = calculateClaimedSum(claimedTransactions)
    const coverage = deriveBillCoverage(billTotal, claimedSum)
    const hasActiveClaim = claimedTransactions.length > 0
    const status = deriveBillStatus({
      canceledAt: billResult.value.canceledAt,
      confirmedClosedAt: billResult.value.confirmedClosedAt,
      hasActiveClaim,
      coverage,
    })

    return ok({
      bill: billResult.value,
      status,
      coverage,
      billTotal,
      claimedSum,
      hasActiveClaim,
    })
  }

/** Reactive-free (`Task`) equivalent of `useBillStatus` — a bill's current derived status. */
export const loadBillStatus =
  (billId: BillId): Task<BillStatus, BillNotFoundError, EvoluDep> =>
  async (run) => {
    const snapshotResult = await run(loadBillStatusSnapshot(billId))
    if (!snapshotResult.ok) return snapshotResult
    return ok(snapshotResult.value.status)
  }

/**
 * Loads a bill and rejects it unless its *derived* status is one of
 * `allowedStatuses`. Used to guard domain invariants around the `open` ->
 * `closed`/`canceled` lifecycle before a mutation is applied. See
 * `docs/bill-payment-states.md`.
 */
const requireBillInStatus =
  (
    billId: BillId,
    allowedStatuses: ReadonlySet<BillStatus>
  ): Task<BillRow, BillNotFoundError | BillNotOpenError, EvoluDep> =>
  async (run) => {
    const snapshotResult = await run(loadBillStatusSnapshot(billId))
    if (!snapshotResult.ok) return snapshotResult

    const { bill: billRow, status } = snapshotResult.value
    if (!allowedStatuses.has(status)) {
      return err(billNotOpen(billId, status))
    }

    return ok(billRow)
  }

const openBillStatuses: ReadonlySet<BillStatus> = new Set(["open"])

/**
 * Whether a bill currently has a live (pending) payment attempt — see
 * `hasPendingPayment`.
 */
const isBillLocked =
  (billId: BillId): Task<boolean, never, EvoluDep & DateDep> =>
  async (run) => {
    const [payments, claimedPayments] = await Promise.all([
      run.deps.evolu.loadQuery(paymentsByBillIdQuery(billId)),
      run.deps.evolu.loadQuery(claimedPaymentsByBillIdQuery(billId)),
    ])

    return ok(
      hasPendingPayment(
        payments,
        claimedPaymentIdSet(claimedPayments),
        run.deps.date.now()
      )
    )
  }

/**
 * A bill that currently accepts line/table edits: `open`, and not locked by
 * a live payment attempt. This is the guard behind every cart-editing
 * action (`addCatalogItemToBill`, `addManualAmountToBill`, `addTipToBill`,
 * `appendRemoveBillLine`, `splitBill`). See docs/bill-payment-states.md.
 */
const requireEditableBill =
  (
    billId: BillId
  ): Task<
    BillRow,
    BillNotFoundError | BillNotOpenError | BillLockedError,
    EvoluDep & DateDep
  > =>
  async (run) => {
    const billResult = await run(requireBillInStatus(billId, openBillStatuses))
    if (!billResult.ok) return billResult

    const locked = await run.ok(isBillLocked(billId))
    if (locked) return err(billLocked(billId))

    return billResult
  }

/**
 * A bill that can accept a new payment attempt: still `open`. Unlike
 * `requireEditableBill`, this deliberately does **not** check for an
 * existing pending payment — starting a second/split payment attempt while
 * another is still pending and unresolved is allowed. Guards here are
 * best-effort for the common single-device path, not a proof, under
 * CRDT/multi-device concurrency. Exported for `payment-actions.ts`'s
 * `createPayment`. See docs/bill-payment-states.md.
 */
export const requireBillAcceptingPayment = (billId: BillId) =>
  requireBillInStatus(billId, openBillStatuses)

const cancelableBillStatuses: ReadonlySet<BillStatus> = new Set([
  "open",
  "canceled",
])

/**
 * Allows re-canceling an already-`canceled` bill as an idempotent no-op, but
 * rejects a `closed` one — once a bill is fully settled it is closed and
 * final, never cancelable.
 */
const requireCancelableBill = (billId: BillId) =>
  requireBillInStatus(billId, cancelableBillStatuses)

/**
 * Given a payment about to gain (or that just gained) a claim, checks
 * whether its bill's coverage is now fully covered (`paid`/`overpaid`,
 * i.e. no longer `underpaid`) and, if so, returns the `closedAt` write
 * ready to fold into the caller's own mutation batch alongside the claim
 * insert — see `upsertBillClosedAt`. Returns `null` when the payment has no
 * bill or the bill isn't (yet) fully covered.
 *
 * Unlike a `status` transition, this no longer excludes `canceled` bills:
 * `closedAt` is just a best-effort cache of "when did this bill's coverage
 * stop being underpaid", independent of `canceledAt` (see `bill.ts`'s doc
 * comment). A cancellation is never overridden by this — the *derived*
 * status still reads `canceled` until staff explicitly resolves it via
 * `confirmBillClosedDespiteCancellation`. See docs/bill-payment-states.md.
 */
export const loadBillClosedAtIfCovered =
  (
    payment: {
      readonly id: PaymentId
      readonly billId: BillId | null
      readonly amount: NonNegativeInteger
      readonly tipAmount: NonNegativeInteger
    },
    accountTransactionId: AccountTransactionId
  ): Task<
    { readonly billId: BillId; readonly closedAt: TimestampMs } | null,
    never,
    EvoluDep & DateDep
  > =>
  async (run) => {
    if (payment.billId === null) return ok(null)

    const billResult = await run(loadBill(payment.billId))
    if (!billResult.ok) return ok(null)

    const { billTotal, claimedTransactions } = await run.ok(
      loadBillTotalAndClaimedSum(payment.billId)
    )
    // The new claim isn't written yet, so it can't show up in
    // `claimedTransactions` — append it here. If it's a retry of a claim
    // that (per a concurrent write) already landed, `calculateClaimedSum`'s
    // own dedup-by-transaction-id collapses the duplicate, so this never
    // double-counts.
    const claimedSum = calculateClaimedSum([
      ...claimedTransactions,
      {
        paymentId: payment.id,
        accountTransactionId,
        amount: payment.amount,
        tipAmount: payment.tipAmount,
      },
    ])

    if (deriveBillCoverage(billTotal, claimedSum) === "underpaid") {
      return ok(null)
    }

    return ok({
      billId: payment.billId,
      // Preserve the bill's original closing time across an idempotent
      // re-close (e.g. a second split payment confirmed after the bill
      // already closed) instead of overwriting it with `now()` every time.
      closedAt:
        billResult.value.closedAt ??
        TimestampMsSchema.decode(run.deps.date.now().getTime()),
    })
  }

export const createBill =
  (
    input: Pick<
      InsertValues<typeof bill>,
      "deviceId" | "displayNumber" | "label" | "tableId" | "currency"
    >
  ): Task<BillId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const { id } = await runMutationWithCompletion((options) =>
      run.deps.evolu.insert("bill", removeUndefinedValues({ ...input }), {
        ...options,
        ownerId: evoluOwnerId,
      })
    )

    return ok(id)
  }

/**
 * Loads the highest existing bill display number (across every bill ever
 * created, not just currently-open ones, so numbers are never reused) and
 * computes the next one, without writing it. Exported so callers that need
 * to fold the bill upsert into a larger mutation batch (e.g.
 * `splitBillIntoNewBill`) can reuse this instead of duplicating it — mirrors
 * `payment-number-actions.ts`'s `loadNextPaymentNumber`.
 */
const loadNextBillDisplayNumber =
  (): Task<PositiveInteger, never, EvoluDep> => async (run) => {
    const existing = await run.deps.evolu.loadQuery(allBillDisplayNumbersQuery)
    const lastDisplayNumber = existing.at(-1)?.displayNumber ?? 0

    return ok(PositiveInteger(lastDisplayNumber + 1))
  }

/**
 * Upserts a bill row for an already-computed display number. Takes the
 * caller's own `MutationOptions` so the write can join an existing mutation
 * batch instead of always opening a new one — mirrors
 * `payment-number-actions.ts`'s `upsertPaymentNumberRows`.
 */
const upsertBillRow = (
  evolu: EvoluDep["evolu"],
  row: UpsertValues<typeof bill>,
  options: MutationOptions
): void => {
  evolu.upsert("bill", removeUndefinedValues(row), options)
}

/**
 * Creates a bill at an `id` the caller already chose — the cart UI generates
 * it client-side and puts it in the `/bill` URL before this ever runs, so the
 * URL stays stable across the lazy-creation moment (see `use-cart-bill.ts`'s
 * `ensureBillExists`). Upserts rather than inserts for that reason: `id` is
 * known ahead of time instead of coming back from the write.
 */
export const createBillAtEnd =
  (
    input: Pick<
      UpsertValues<typeof bill>,
      "id" | "deviceId" | "label" | "tableId" | "currency"
    >
  ): Task<BillId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const displayNumber = await run.ok(loadNextBillDisplayNumber())

    await runMutationWithCompletion((options) =>
      upsertBillRow(
        run.deps.evolu,
        { ...input, displayNumber },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(input.id)
  }

export const assignBillToTable =
  (
    input: Pick<UpdateValues<typeof bill>, "id" | "tableId">
  ): Task<BillId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "bill",
        {
          id: input.id,
          tableId: input.tableId,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(input.id)
  }

export const removeTableFromBill =
  (billId: BillId): Task<BillId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "bill",
        { id: billId, tableId: null },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(billId)
  }

/**
 * Shared "insert a snapshot + an `add` bill line for it, then read back the
 * resulting summary" step behind `addCatalogItemToBill`, `addManualAmountToBill`,
 * and `addTipToBill` — they differ only in the line's `type` and how its
 * snapshot/detail fields are produced.
 */
const addBillLine =
  <TType extends ItemLineType>(
    type: TType,
    snapshot: ItemRow,
    line: Pick<
      BillLineRow,
      "billId" | "deviceId" | "catalogItemId" | "quantity" | "totalAmount"
    >
  ): Task<
    BillLineSummary,
    BillLineSummaryMissingError,
    EvoluDep & EvoluOwnerIdDep
  > =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) => {
      upsertItemSnapshot(run.deps.evolu, snapshot, {
        ...options,
        ownerId: evoluOwnerId,
      })
      insertBillLineRows(
        run.deps.evolu,
        [{ ...line, itemId: snapshot.id, type, kind: "add" }],
        { ...options, ownerId: evoluOwnerId }
      )
    })

    const projected = await run.ok(loadCalculatedBillLineSummaries(line.billId))
    const lineSummary = projected.find((row) => row.itemId === snapshot.id)

    return lineSummary === undefined
      ? err(
          billLineSummaryMissing({
            billId: line.billId,
            itemId: snapshot.id,
            lineType: type,
          })
        )
      : ok(lineSummary)
  }

export const addCatalogItemToBill =
  (
    input: Pick<
      InsertValues<typeof billLine>,
      "billId" | "deviceId" | "quantity"
    > & {
      readonly catalogItemId: NonNullable<
        InsertValues<typeof billLine>["catalogItemId"]
      >
    }
  ): Task<
    BillLineSummary,
    AddBillLineError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const billResult = await run(requireEditableBill(input.billId))
    if (!billResult.ok) return billResult

    const catalogItemResult = getFirstOr(
      await run.deps.evolu.loadQuery(catalogItemByIdQuery(input.catalogItemId)),
      catalogItemNotFound(input.catalogItemId)
    )
    if (!catalogItemResult.ok) return catalogItemResult

    const snapshot = createCatalogItemSnapshot(catalogItemResult.value)

    return run(
      addBillLine("catalogItem", snapshot, {
        billId: input.billId,
        deviceId: input.deviceId ?? null,
        catalogItemId: catalogItemResult.value.id,
        quantity: input.quantity,
        totalAmount: NonNegativeInteger(
          catalogItemResult.value.unitAmount * input.quantity
        ),
      })
    )
  }

export const addManualAmountToBill =
  (
    input: Pick<
      InsertValues<typeof billLine>,
      "billId" | "deviceId" | "totalAmount"
    > &
      Pick<InsertValues<typeof item>, "name" | "currency">
  ): Task<
    BillLineSummary,
    | BillLineSummaryMissingError
    | BillNotFoundError
    | BillNotOpenError
    | BillLockedError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const billResult = await run(requireEditableBill(input.billId))
    if (!billResult.ok) return billResult

    const snapshot = createStandaloneItemSnapshot({
      catalogItemId: null,
      name: input.name,
      description: null,
      currency: input.currency,
      unitAmount: input.totalAmount,
      taxRateId: null,
    })

    return run(
      addBillLine("manualAmount", snapshot, {
        billId: input.billId,
        deviceId: input.deviceId ?? null,
        catalogItemId: null,
        quantity: PositiveNumber(1),
        totalAmount: input.totalAmount,
      })
    )
  }

export const addTipToBill =
  (
    input: Pick<
      InsertValues<typeof billLine>,
      "billId" | "deviceId" | "totalAmount"
    > &
      Pick<InsertValues<typeof item>, "name" | "currency">
  ): Task<
    BillLineSummary,
    | BillLineSummaryMissingError
    | BillNotFoundError
    | BillNotOpenError
    | BillLockedError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const billResult = await run(requireEditableBill(input.billId))
    if (!billResult.ok) return billResult

    const snapshot = createStandaloneItemSnapshot({
      catalogItemId: null,
      name: input.name,
      description: null,
      currency: input.currency,
      unitAmount: input.totalAmount,
      taxRateId: null,
    })

    return run(
      addBillLine("tip", snapshot, {
        billId: input.billId,
        deviceId: input.deviceId ?? null,
        catalogItemId: null,
        quantity: PositiveNumber(1),
        totalAmount: input.totalAmount,
      })
    )
  }

export const appendRemoveBillLine =
  (
    input: Pick<
      InsertValues<typeof billLine>,
      "billId" | "deviceId" | "quantity" | "totalAmount"
    > & {
      readonly lineSummary: BillLineSummary
    }
  ): Task<
    BillLineSummary | null,
    BillNotFoundError | BillNotOpenError | BillLockedError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const billResult = await run(requireEditableBill(input.billId))
    if (!billResult.ok) return billResult

    const projected = await run.ok(
      appendBillLine({
        billId: input.billId,
        deviceId: input.deviceId ?? null,
        catalogItemId: input.lineSummary.catalogItemId,
        itemId: input.lineSummary.itemId,
        type: input.lineSummary.type,
        kind: "remove",
        quantity: input.quantity,
        totalAmount: input.totalAmount,
      })
    )
    return ok(projected.find((row) => row.id === input.lineSummary.id) ?? null)
  }

/**
 * Every open bill with its calculated line items, in one query — `lines` and
 * `items` ride along on `openBillsQuery` (see its doc comment), so this no
 * longer loads summaries per bill. `lines`/`items` are stripped off the
 * returned `bill` so it stays a plain `BillRow`: `bin/cli-bills.ts` spreads it
 * straight into `console.table`.
 */
export const listOpenBills =
  (): Task<ReadonlyArray<BillWithItems>, never, EvoluDep> => async (run) => {
    const bills = await run.deps.evolu.loadQuery(openBillsQuery)

    return ok(
      bills.map(
        ({ lines, items, ...bill }): BillWithItems => ({
          bill,
          items: calculateBillLineSummaries(lines, items),
        })
      )
    )
  }

/**
 * Pairs each item with a "remove" row on `sourceBillId` and an "add" row on
 * `targetBillId` — the move itself, shared by `splitBill` and
 * `splitBillIntoNewBill`, which differ only in how they guard/write it.
 */
const buildSplitLines = (
  sourceBillId: BillId,
  targetBillId: BillId,
  items: ReadonlyArray<BillLineSummary>
): Omit<BillLineRow, "id">[] => {
  const lines: Omit<BillLineRow, "id">[] = []
  for (const item of items) {
    lines.push({
      billId: sourceBillId,
      deviceId: null,
      catalogItemId: item.catalogItemId,
      itemId: item.itemId,
      type: item.type,
      kind: "remove",
      quantity: item.quantity,
      totalAmount: item.totalAmount,
    })
    lines.push({
      billId: targetBillId,
      deviceId: null,
      catalogItemId: item.catalogItemId,
      itemId: item.itemId,
      type: item.type,
      kind: "add",
      quantity: item.quantity,
      totalAmount: item.totalAmount,
    })
  }
  return lines
}

/**
 * Checks whether moving `movedItems` off `currentSummaries` would leave the
 * bill with no line items at all (matched by `BillLineSummary["id"]`, stable
 * per bill/catalogItemId/itemId/type — see `createBillLineSummaryId`) and, if
 * so, writes the same `canceledAt` field `cancelBill` does, folded into the
 * caller's own mutation batch instead of opening a second one. Returns
 * whether it canceled, so a caller that needs to know (e.g. to decide
 * whether the UI should navigate away) can read it off the result.
 */
const cancelSourceBillIfEmptied = (
  evolu: EvoluDep["evolu"],
  sourceBillId: BillId,
  currentSummaries: ReadonlyArray<BillLineSummary>,
  movedItems: ReadonlyArray<BillLineSummary>,
  now: TimestampMs,
  options: MutationOptions
): boolean => {
  const movedQuantityById = new Map(
    movedItems.map((item) => [item.id, item.quantity])
  )
  // `every` is vacuously true on an empty list, so the length check is what
  // keeps "nothing was there to move" from reading as "everything moved
  // out": a bill with no lines, or a summary load that came back empty
  // (it runs concurrently with the guard reads in `splitBill`), would
  // otherwise be canceled without anything actually being emptied out of it.
  const sourceCanceled =
    currentSummaries.length > 0 &&
    currentSummaries.every(
      (summary) => (movedQuantityById.get(summary.id) ?? 0) >= summary.quantity
    )
  if (sourceCanceled) {
    evolu.update("bill", { id: sourceBillId, canceledAt: now }, options)
  }
  return sourceCanceled
}

export const splitBill =
  (input: {
    readonly sourceBillId: BillId
    readonly targetBillId: BillId
    readonly items: ReadonlyArray<BillLineSummary>
  }): Task<
    BillWithItems & { readonly sourceCanceled: boolean },
    SplitBillError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    // Independent reads run concurrently: the edit guards on both bills
    // don't depend on the source's current summaries and vice versa.
    const [sourceBillResult, targetBillResult, currentSourceSummaries] =
      await Promise.all([
        run(requireEditableBill(input.sourceBillId)),
        run(requireEditableBill(input.targetBillId)),
        run.ok(loadCalculatedBillLineSummaries(input.sourceBillId)),
      ])
    if (!sourceBillResult.ok) return sourceBillResult
    if (!targetBillResult.ok) return targetBillResult

    const lines = buildSplitLines(
      input.sourceBillId,
      input.targetBillId,
      input.items
    )
    const { evoluOwnerId } = run.deps

    // An empty selection has nothing to write, and an empty batch would
    // never resolve — see `runMutationWithCompletion`. `appendBillLines`
    // guards its own batch the same way. With no line moved off the source,
    // `cancelSourceBillIfEmptied` could only ever answer `false` anyway.
    const sourceCanceled =
      lines.length === 0
        ? false
        : await runMutationWithCompletion((options) => {
            insertBillLineRows(run.deps.evolu, lines, {
              ...options,
              ownerId: evoluOwnerId,
            })
            return cancelSourceBillIfEmptied(
              run.deps.evolu,
              input.sourceBillId,
              currentSourceSummaries,
              input.items,
              TimestampMsSchema.decode(run.deps.date.now().getTime()),
              { ...options, ownerId: evoluOwnerId }
            )
          })

    const targetItems = await run.ok(
      loadCalculatedBillLineSummaries(input.targetBillId)
    )

    return ok({
      bill: targetBillResult.value,
      items: targetItems,
      sourceCanceled,
    })
  }

/**
 * Creates a brand-new bill and, in the same mutation batch, moves the
 * selected `items` off `sourceBillId` onto it — the "split bill" entry point
 * used by the `/bill` UI. One batch instead of `createBillAtEnd` followed by
 * `splitBill`'s own separate one: the target bill's `id` is chosen by the
 * caller (same client-generated-id convention as `createBillAtEnd`), so
 * nothing needs to be read back before the line moves can be written
 * alongside it.
 *
 * `sourceBillId` must still be open and unlocked at the moment this actually
 * runs, not just when the UI opened the split screen — same guard as every
 * other cart-editing action, checked immediately before the write within
 * this same function. See docs/bill-payment-states.md. The new bill needs no
 * such check: it does not exist yet, so it is trivially open.
 *
 * Also auto-cancels `sourceBillId` in the same batch if this move empties it
 * out entirely (e.g. every line fully selected) — same cleanup `splitBill`
 * does, so a full split never leaves a dangling empty open bill behind
 * regardless of which action moved it. The caller always navigates to the
 * new bill either way, so this isn't surfaced in the return value.
 */
export const splitBillIntoNewBill =
  (
    input: Pick<
      UpsertValues<typeof bill>,
      "deviceId" | "tableId" | "currency"
    > & {
      readonly sourceBillId: BillId
      readonly targetBillId: BillId
      readonly items: ReadonlyArray<BillLineSummary>
    }
  ): Task<BillId, SplitBillError, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    // Independent reads run concurrently before the mutation batch starts.
    const [sourceBillResult, displayNumber, currentSourceSummaries] =
      await Promise.all([
        run(requireEditableBill(input.sourceBillId)),
        run.ok(loadNextBillDisplayNumber()),
        run.ok(loadCalculatedBillLineSummaries(input.sourceBillId)),
      ])
    if (!sourceBillResult.ok) return sourceBillResult

    const { evoluOwnerId } = run.deps
    const lines = buildSplitLines(
      input.sourceBillId,
      input.targetBillId,
      input.items
    )

    await runMutationWithCompletion((options) => {
      upsertBillRow(
        run.deps.evolu,
        {
          id: input.targetBillId,
          deviceId: input.deviceId,
          label: null,
          tableId: input.tableId,
          currency: input.currency,
          displayNumber,
        },
        { ...options, ownerId: evoluOwnerId }
      )
      insertBillLineRows(run.deps.evolu, lines, {
        ...options,
        ownerId: evoluOwnerId,
      })
      cancelSourceBillIfEmptied(
        run.deps.evolu,
        input.sourceBillId,
        currentSourceSummaries,
        input.items,
        TimestampMsSchema.decode(run.deps.date.now().getTime()),
        { ...options, ownerId: evoluOwnerId }
      )
    })

    return ok(input.targetBillId)
  }

export const cancelBill =
  (
    billId: BillId
  ): Task<
    BillId,
    BillNotFoundError | BillNotOpenError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const billResult = await run(requireCancelableBill(billId))
    if (!billResult.ok) return billResult

    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "bill",
        {
          id: billId,
          canceledAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(billId)
  }

/**
 * Writes the `closedAt` best-effort cache (see `bill.ts`'s doc comment).
 * Takes the caller's own `MutationOptions` so the write can join an
 * existing mutation batch — `reconciliation-claim-actions.ts` folds this in
 * via `loadBillClosedAtIfCovered` so it lands in the same batch as the
 * reconciliation claim confirming it, instead of opening a second round
 * trip that could fail independently. See docs/bill-payment-states.md.
 */
export const upsertBillClosedAt = (
  evolu: EvoluDep["evolu"],
  billId: BillId,
  closedAt: BillRow["closedAt"],
  options: MutationOptions
): void => {
  evolu.update("bill", { id: billId, closedAt }, options)
}

/**
 * Manually refreshes a bill's `closedAt` cache (e.g. `bin/cli-bills.ts
 * close`) — a repair tool for the rare multi-device race where the
 * automatic write in `loadBillClosedAtIfCovered` never landed (see
 * `bill.ts`'s doc comment), not a way to force a bill closed. Rejects a
 * `canceled` bill (use `confirmBillClosedDespiteCancellation` for that
 * collision) and one with no active claim yet or still `underpaid` —
 * `docs/bill-payment-states.md` states a `closed` bill is always `paid` or
 * `overpaid`, never `underpaid`.
 */
export const closeBill =
  (
    billId: BillId
  ): Task<
    BillId,
    BillNotFoundError | BillNotOpenError | BillUnderpaidError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const snapshotResult = await run(loadBillStatusSnapshot(billId))
    if (!snapshotResult.ok) return snapshotResult

    const {
      bill: billRow,
      status,
      coverage,
      billTotal,
      claimedSum,
      hasActiveClaim,
    } = snapshotResult.value

    if (status === "canceled") {
      return err(billNotOpen(billId, status))
    }
    if (!hasActiveClaim || coverage === "underpaid") {
      return err(billUnderpaid(billId, billTotal, claimedSum))
    }

    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      upsertBillClosedAt(
        run.deps.evolu,
        billId,
        billRow.closedAt ??
          TimestampMsSchema.decode(run.deps.date.now().getTime()),
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(billId)
  }

export type ConfirmBillClosedDespiteCancellationError =
  | BillNotFoundError
  | BillNotCanceledError
  | BillUnderpaidError

/**
 * Resolves the canceled+funded collision mirrored from the payment
 * vertical's `confirmPaymentPaidDespiteCancellation`: a bill can be
 * `canceled` (an explicit discard) while its payments' claims already cover
 * its total — money that arrived despite the cancellation. This lets staff
 * explicitly acknowledge that and flip the bill's *derived* status from
 * `canceled` to `closed` via `confirmedClosedAt`, without ever touching
 * `canceledAt` itself. Requires both an existing cancellation and an
 * already-covered bill — this resolves an existing collision, it does not
 * create a way to force-close an underpaid canceled bill. See
 * docs/bill-payment-states.md.
 */
export const confirmBillClosedDespiteCancellation =
  (
    billId: BillId
  ): Task<
    BillId,
    ConfirmBillClosedDespiteCancellationError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const snapshotResult = await run(loadBillStatusSnapshot(billId))
    if (!snapshotResult.ok) return snapshotResult

    const {
      bill: billRow,
      coverage,
      billTotal,
      claimedSum,
      hasActiveClaim,
    } = snapshotResult.value

    if (billRow.canceledAt === null) {
      return err(billNotCanceled(billId))
    }
    if (!hasActiveClaim || coverage === "underpaid") {
      return err(billUnderpaid(billId, billTotal, claimedSum))
    }

    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "bill",
        {
          id: billId,
          confirmedClosedAt: TimestampMsSchema.decode(
            run.deps.date.now().getTime()
          ),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(billId)
  }

/**
 * Appends a batch of already-computed bill lines after checking the bill is
 * still editable — used by cart-level undo/redo/clear (`use-cart-bill.ts`),
 * which otherwise called `appendBillLines` directly with no status/lock
 * guard at all, silently bypassing the editing lock for as long as a
 * payment is pending on the bill. See docs/bill-payment-states.md.
 */
export const appendGuardedBillLines =
  (
    billId: BillId,
    lines: ReadonlyArray<Omit<BillLineRow, "id">>
  ): Task<
    ReadonlyArray<BillLineSummary>,
    BillNotFoundError | BillNotOpenError | BillLockedError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const billResult = await run(requireEditableBill(billId))
    if (!billResult.ok) return billResult

    return run(appendBillLines(lines, billId))
  }
