import {
  err,
  type InsertValues,
  type MutationOptions,
  ok,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
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
  type BillStatus,
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
  calculateClaimedSum,
  claimedPaymentIdSet,
  deriveBillCoverage,
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
 * Shared "bill's line-item total + its claimed payments" load behind
 * `loadBillCoverage` and `loadBillClosingAfterClaim`.
 */
const loadBillTotalAndClaimedSum =
  (
    billId: BillId
  ): Task<
    {
      readonly billTotal: NonNegativeInteger
      readonly claimedPayments: ReadonlyArray<{
        readonly id: PaymentId
        readonly amount: NonNegativeInteger
        readonly tipAmount: NonNegativeInteger
      }>
    },
    never,
    EvoluDep
  > =>
  async (run) => {
    const [summaries, claimedPayments] = await Promise.all([
      run.ok(loadCalculatedBillLineSummaries(billId)),
      run.deps.evolu.loadQuery(claimedPaymentsByBillIdQuery(billId)),
    ])

    return ok({
      billTotal: NonNegativeInteger(
        summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
      ),
      claimedPayments,
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
    const { billTotal, claimedPayments } = await run.ok(
      loadBillTotalAndClaimedSum(billId)
    )
    const claimedSum = calculateClaimedSum(claimedPayments)

    return ok({
      billTotal,
      claimedSum,
      coverage: deriveBillCoverage(billTotal, claimedSum),
    })
  }

/**
 * Loads a bill and rejects it unless its status is one of `allowedStatuses`.
 * Used to guard domain invariants around the `open` -> `closed`/`canceled`
 * lifecycle before a mutation is applied. See `docs/bill-payment-states.md`.
 */
const requireBillInStatus =
  (
    billId: BillId,
    allowedStatuses: ReadonlySet<BillStatus>
  ): Task<BillRow, BillNotFoundError | BillNotOpenError, EvoluDep> =>
  async (run) => {
    const billResult = await run(loadBill(billId))
    if (!billResult.ok) return billResult

    const { value: billRow } = billResult
    if (!allowedStatuses.has(billRow.status)) {
      return err(billNotOpen(billId, billRow.status))
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

const closableBillStatuses: ReadonlySet<BillStatus> = new Set([
  "open",
  "closed",
])

/**
 * Allows re-closing an already-`closed` bill as an idempotent no-op (two
 * devices racing to close the same bill, or two claims landing close
 * together), but rejects a `canceled` one.
 */
export const requireClosableBill = (billId: BillId) =>
  requireBillInStatus(billId, closableBillStatuses)

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
 * Given a payment that just gained a reconciliation claim, checks whether
 * the bill it belongs to is now fully covered (`paid` or `overpaid`, i.e.
 * no longer `underpaid`) and, if so, returns the closing write ready to
 * fold into the caller's own mutation batch alongside the claim insert —
 * see `upsertBillClosedRow`. Returns `null` when the payment has no bill,
 * the bill isn't (yet) fully covered, or the bill is `canceled` (a
 * cancellation is never overridden by a late/stray claim — see
 * docs/bill-payment-states.md).
 */
export const loadBillClosingAfterClaim =
  (payment: {
    readonly id: PaymentId
    readonly billId: BillId | null
    readonly amount: NonNegativeInteger
    readonly tipAmount: NonNegativeInteger
  }): Task<
    { readonly billId: BillId; readonly closedAt: TimestampMs } | null,
    never,
    EvoluDep & DateDep
  > =>
  async (run) => {
    if (payment.billId === null) return ok(null)

    const closableResult = await run(requireClosableBill(payment.billId))
    if (!closableResult.ok) return ok(null)

    const { billTotal, claimedPayments } = await run.ok(
      loadBillTotalAndClaimedSum(payment.billId)
    )
    const alreadyClaimed = claimedPayments.some(
      (claimed) => claimed.id === payment.id
    )
    const claimedSum = calculateClaimedSum(
      alreadyClaimed ? claimedPayments : [...claimedPayments, payment]
    )

    if (deriveBillCoverage(billTotal, claimedSum) === "underpaid") {
      return ok(null)
    }

    return ok({
      billId: payment.billId,
      // Preserve the bill's original closing time across an idempotent
      // re-close (e.g. a second split payment confirmed after the bill
      // already closed) instead of overwriting it with `now()` every time.
      closedAt:
        closableResult.value.closedAt ??
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
      run.deps.evolu.insert(
        "bill",
        removeUndefinedValues({
          ...input,
          status: "open",
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(id)
  }

/**
 * Creates a bill with a `displayNumber` derived from the highest existing
 * one (across every status, not just open bills, so numbers are never
 * reused) instead of taking it as input. This is the entry point cart UIs
 * use to lazily create the bill behind a new cart.
 */
export const createBillAtEnd =
  (
    input: Pick<
      InsertValues<typeof bill>,
      "deviceId" | "label" | "tableId" | "currency"
    >
  ): Task<BillId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const existing = await run.deps.evolu.loadQuery(allBillDisplayNumbersQuery)
    const lastDisplayNumber = existing.at(-1)?.displayNumber ?? 0

    return ok(
      await run.ok(
        createBill({
          ...input,
          displayNumber: PositiveInteger(lastDisplayNumber + 1),
        })
      )
    )
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

export const moveBillToTable = assignBillToTable

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

export const listOpenBills =
  (): Task<ReadonlyArray<BillWithItems>, never, EvoluDep> => async (run) => {
    const bills = await run.deps.evolu.loadQuery(openBillsQuery)
    return ok(
      await Promise.all(
        bills.map(
          async (bill): Promise<BillWithItems> => ({
            bill,
            items: await run.ok(loadCalculatedBillLineSummaries(bill.id)),
          })
        )
      )
    )
  }

export const splitBill =
  (input: {
    readonly sourceBillId: BillId
    readonly targetBillId: BillId
    readonly items: ReadonlyArray<BillLineSummary>
  }): Task<
    BillWithItems,
    SplitBillError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const sourceBillResult = await run(requireEditableBill(input.sourceBillId))
    if (!sourceBillResult.ok) return sourceBillResult

    const targetBillResult = await run(requireEditableBill(input.targetBillId))
    if (!targetBillResult.ok) return targetBillResult

    const lines: Omit<BillLineRow, "id">[] = []
    for (const item of input.items) {
      lines.push({
        billId: input.sourceBillId,
        deviceId: null,
        catalogItemId: item.catalogItemId,
        itemId: item.itemId,
        type: item.type,
        kind: "remove",
        quantity: item.quantity,
        totalAmount: item.totalAmount,
      })
      lines.push({
        billId: input.targetBillId,
        deviceId: null,
        catalogItemId: item.catalogItemId,
        itemId: item.itemId,
        type: item.type,
        kind: "add",
        quantity: item.quantity,
        totalAmount: item.totalAmount,
      })
    }
    const targetItems = await run.ok(appendBillLines(lines, input.targetBillId))

    return ok({
      bill: targetBillResult.value,
      items: targetItems,
    })
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
          status: "canceled",
          canceledAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(billId)
  }

/**
 * Marks a bill closed (a fully covered/settled tab, final). Takes the
 * caller's own `MutationOptions` so the write can join an existing mutation
 * batch — `reconciliation-claim-actions.ts` folds this in via
 * `loadBillClosingAfterClaim` so a bill closes in the same batch that
 * writes the reconciliation claim confirming it, instead of opening a
 * second round trip that could fail independently. See
 * docs/bill-payment-states.md.
 */
export const upsertBillClosedRow = (
  evolu: EvoluDep["evolu"],
  billId: BillId,
  closedAt: BillRow["closedAt"],
  options: MutationOptions
): void => {
  evolu.update("bill", { id: billId, status: "closed", closedAt }, options)
}

/**
 * Manually closes a bill (e.g. `bin/cli-bills.ts close`). Rejects an
 * `underpaid` bill: `docs/bill-payment-states.md` states a closed bill is
 * always `paid` or `overpaid`, never `underpaid` — this guard is what keeps
 * that true for closes that don't go through `loadBillClosingAfterClaim`.
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
    const billResult = await run(requireClosableBill(billId))
    if (!billResult.ok) return billResult

    const coverage = await run.ok(loadBillCoverage(billId))
    if (coverage.coverage === "underpaid") {
      return err(billUnderpaid(billId, coverage.billTotal, coverage.claimedSum))
    }

    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      upsertBillClosedRow(
        run.deps.evolu,
        billId,
        billResult.value.closedAt ??
          TimestampMsSchema.decode(run.deps.date.now().getTime()),
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
