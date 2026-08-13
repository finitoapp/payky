import {
  err,
  type InsertValues,
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
  type ItemLineType,
  NonNegativeInteger,
  PositiveNumber,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { billByIdQuery, openBillsQuery } from "./bill-queries.ts"
import type { BillId } from "./bill-types.ts"

export interface BillWithItems {
  readonly bill: BillRow
  readonly items: ReadonlyArray<BillLineSummary>
}

const createBillNotFoundError = defineError("BillNotFound")<{
  readonly id: BillId
}>()
export type BillNotFoundError = ReturnType<typeof createBillNotFoundError>

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

export type SplitBillError = BillNotFoundError

export const billNotFound = (id: BillId): BillNotFoundError =>
  createBillNotFoundError({ id })

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

    const projected = await run.orThrow(
      loadCalculatedBillLineSummaries(line.billId)
    )
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
  ): Task<BillLineSummary, AddBillLineError, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
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
    BillLineSummaryMissingError,
    EvoluDep & EvoluOwnerIdDep
  > =>
  (run) => {
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
    BillLineSummaryMissingError,
    EvoluDep & EvoluOwnerIdDep
  > =>
  (run) => {
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
  ): Task<BillLineSummary | null, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const projected = await run.orThrow(
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
            items: await run.orThrow(loadCalculatedBillLineSummaries(bill.id)),
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
  }): Task<BillWithItems, SplitBillError, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const targetBillResult = await run(loadBill(input.targetBillId))
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
    const targetItems = await run.orThrow(
      appendBillLines(lines, input.targetBillId)
    )

    return ok({
      bill: targetBillResult.value,
      items: targetItems,
    })
  }

export const partiallyPayBill =
  (
    input: Pick<UpdateValues<typeof bill>, "id"> & {
      readonly paymentId: PaymentId
    }
  ): Task<BillId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    void input.paymentId

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "bill",
        {
          id: input.id,
          status: "partiallyPaid",
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(input.id)
  }

export const cancelBill =
  (billId: BillId): Task<BillId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
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

export const closeBillAsPaid =
  (billId: BillId): Task<BillId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "bill",
        {
          id: billId,
          status: "paid",
          closedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(billId)
  }
