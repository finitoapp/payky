import {
  err,
  type InsertValues,
  ok,
  type Result,
  type UpdateValues,
} from "@evolu/common"

import { defineError } from "@/core/error.ts"
import type { BillRow, bill } from "@/core/modules/bill/bill.ts"
import type { BillItemRow } from "@/core/modules/bill-item/bill-item.ts"
import type { billItemLine } from "@/core/modules/bill-item-line/bill-item-line.ts"
import { catalogItemByIdQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { item } from "@/core/modules/item/item.ts"
import { createStandaloneItemSnapshot } from "@/core/modules/item/item-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { billByIdQuery, openBillsQuery } from "./bill-queries.ts"
import type { BillId } from "./bill-types.ts"
import {
  appendBillItemLine,
  createOrReuseCatalogItemSnapshot,
  createOrReuseItemSnapshot,
  loadCalculatedBillItems,
  syncBillItemProjection,
} from "./bill-utils.ts"

export interface BillWithItems {
  readonly bill: BillRow
  readonly items: ReadonlyArray<BillItemRow>
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

const createBillItemProjectionMissingError = defineError(
  "BillItemProjectionMissing"
)<{
  readonly billId: BillId
  readonly itemId: BillItemRow["itemId"]
  readonly lineType: BillItemRow["type"]
}>()
export type BillItemProjectionMissingError = ReturnType<
  typeof createBillItemProjectionMissingError
>

export type AddBillItemError =
  | CatalogItemNotFoundError
  | BillItemProjectionMissingError

export type SplitBillError = BillNotFoundError

export const billNotFound = (id: BillId): BillNotFoundError =>
  createBillNotFoundError({ id })

export const catalogItemNotFound = (
  id: CatalogItemId
): CatalogItemNotFoundError => createCatalogItemNotFoundError({ id })

const billItemProjectionMissing = (input: {
  readonly billId: BillId
  readonly itemId: BillItemRow["itemId"]
  readonly lineType: BillItemRow["type"]
}): BillItemProjectionMissingError =>
  createBillItemProjectionMissingError(input)

export const loadBill =
  (deps: EvoluDep) =>
  async (idValue: BillId): Promise<Result<BillRow, BillNotFoundError>> =>
    getFirstOr(
      await deps.evolu.loadQuery(billByIdQuery(idValue)),
      billNotFound(idValue)
    )

export const createBill =
  (deps: EvoluDep) =>
  async (
    input: Pick<
      InsertValues<typeof bill>,
      "deviceId" | "displayNumber" | "label" | "tableId" | "currency"
    >
  ): Promise<BillId> => {
    const { id } = await runMutationWithCompletion((options) =>
      deps.evolu.insert(
        "bill",
        removeUndefinedValues({
          ...input,
          status: "open",
        }),
        options
      )
    )

    return id
  }

export const assignBillToTable =
  (deps: EvoluDep) =>
  async (
    input: Pick<UpdateValues<typeof bill>, "id" | "tableId">
  ): Promise<BillId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "bill",
        {
          id: input.id,
          tableId: input.tableId,
        },
        options
      )
    )

    return input.id
  }

export const moveBillToTable = assignBillToTable

export const removeTableFromBill =
  (deps: EvoluDep) =>
  async (billId: BillId): Promise<BillId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update("bill", { id: billId, tableId: null }, options)
    )

    return billId
  }

export const addCatalogItemToBill =
  (deps: EvoluDep) =>
  async (
    input: Pick<
      InsertValues<typeof billItemLine>,
      "billId" | "deviceId" | "quantity"
    > & {
      readonly catalogItemId: NonNullable<
        InsertValues<typeof billItemLine>["catalogItemId"]
      >
    }
  ): Promise<Result<BillItemRow, AddBillItemError>> => {
    const catalogItemResult = getFirstOr(
      await deps.evolu.loadQuery(catalogItemByIdQuery(input.catalogItemId)),
      catalogItemNotFound(input.catalogItemId)
    )
    if (!catalogItemResult.ok) return catalogItemResult

    const item = await createOrReuseCatalogItemSnapshot(deps)(
      catalogItemResult.value
    )
    const projected = await appendBillItemLine(deps)({
      billId: input.billId,
      deviceId: input.deviceId ?? null,
      catalogItemId: catalogItemResult.value.id,
      itemId: item.id,
      type: "catalogItem",
      kind: "add",
      quantity: input.quantity,
      totalAmount: NonNegativeInteger(
        catalogItemResult.value.unitAmount * input.quantity
      ),
    })
    const billItem = projected.find((row) => row.itemId === item.id)
    return billItem == null
      ? err(
          billItemProjectionMissing({
            billId: input.billId,
            itemId: item.id,
            lineType: "catalogItem",
          })
        )
      : ok(billItem)
  }

export const addManualAmountToBill =
  (deps: EvoluDep) =>
  async (
    input: Pick<
      InsertValues<typeof billItemLine>,
      "billId" | "deviceId" | "totalAmount"
    > &
      Pick<InsertValues<typeof item>, "name" | "currency">
  ): Promise<Result<BillItemRow, BillItemProjectionMissingError>> => {
    const snapshot = createStandaloneItemSnapshot({
      catalogItemId: null,
      name: input.name,
      description: null,
      currency: input.currency,
      unitAmount: input.totalAmount,
    })
    createOrReuseItemSnapshot(deps)(snapshot)
    const projected = await appendBillItemLine(deps)({
      billId: input.billId,
      deviceId: input.deviceId ?? null,
      catalogItemId: null,
      itemId: snapshot.id,
      type: "manualAmount",
      kind: "add",
      quantity: PositiveNumber(1),
      totalAmount: input.totalAmount,
    })
    const billItem = projected.find((row) => row.itemId === snapshot.id)
    return billItem == null
      ? err(
          billItemProjectionMissing({
            billId: input.billId,
            itemId: snapshot.id,
            lineType: "manualAmount",
          })
        )
      : ok(billItem)
  }

export const addTipToBill =
  (deps: EvoluDep) =>
  async (
    input: Pick<
      InsertValues<typeof billItemLine>,
      "billId" | "deviceId" | "totalAmount"
    > &
      Pick<InsertValues<typeof item>, "name" | "currency">
  ): Promise<Result<BillItemRow, BillItemProjectionMissingError>> => {
    const snapshot = createStandaloneItemSnapshot({
      catalogItemId: null,
      name: input.name,
      description: null,
      currency: input.currency,
      unitAmount: input.totalAmount,
    })
    createOrReuseItemSnapshot(deps)(snapshot)
    const projected = await appendBillItemLine(deps)({
      billId: input.billId,
      deviceId: input.deviceId ?? null,
      catalogItemId: null,
      itemId: snapshot.id,
      type: "tip",
      kind: "add",
      quantity: PositiveNumber(1),
      totalAmount: input.totalAmount,
    })
    const billItem = projected.find((row) => row.itemId === snapshot.id)
    return billItem == null
      ? err(
          billItemProjectionMissing({
            billId: input.billId,
            itemId: snapshot.id,
            lineType: "tip",
          })
        )
      : ok(billItem)
  }

export const appendRemoveBillItemLine =
  (deps: EvoluDep) =>
  async (
    input: Pick<
      InsertValues<typeof billItemLine>,
      "billId" | "deviceId" | "quantity" | "totalAmount"
    > & {
      readonly billItem: BillItemRow
    }
  ): Promise<Result<BillItemRow | null, never>> => {
    const projected = await appendBillItemLine(deps)({
      billId: input.billId,
      deviceId: input.deviceId ?? null,
      catalogItemId: input.billItem.catalogItemId,
      itemId: input.billItem.itemId,
      type: input.billItem.type,
      kind: "remove",
      quantity: input.quantity,
      totalAmount: input.totalAmount,
    })
    return ok(projected.find((row) => row.id === input.billItem.id) ?? null)
  }

export const listOpenBills =
  (deps: EvoluDep) => async (): Promise<ReadonlyArray<BillWithItems>> => {
    const bills = await deps.evolu.loadQuery(openBillsQuery)
    return Promise.all(
      bills.map(
        async (bill): Promise<BillWithItems> => ({
          bill,
          items: await loadCalculatedBillItems(deps)(bill.id),
        })
      )
    )
  }

export const splitBill =
  (deps: EvoluDep) =>
  async (input: {
    readonly sourceBillId: BillId
    readonly targetBillId: BillId
    readonly items: ReadonlyArray<BillItemRow>
  }): Promise<Result<BillWithItems, SplitBillError>> => {
    const targetBillResult = await loadBill(deps)(input.targetBillId)
    if (!targetBillResult.ok) return targetBillResult

    for (const item of input.items) {
      await appendBillItemLine(deps)({
        billId: input.sourceBillId,
        deviceId: null,
        catalogItemId: item.catalogItemId,
        itemId: item.itemId,
        type: item.type,
        kind: "remove",
        quantity: item.quantity,
        totalAmount: item.totalAmount,
      })
      await appendBillItemLine(deps)({
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

    return ok({
      bill: targetBillResult.value,
      items: await syncBillItemProjection(deps)(input.targetBillId),
    })
  }

export const partiallyPayBill =
  (deps: EvoluDep) =>
  async (
    input: Pick<UpdateValues<typeof bill>, "id"> & {
      readonly paymentId: PaymentId
    }
  ): Promise<BillId> => {
    void input.paymentId

    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "bill",
        {
          id: input.id,
          status: "partiallyPaid",
        },
        options
      )
    )

    return input.id
  }

export const cancelBill =
  (deps: EvoluDep) =>
  async (billId: BillId): Promise<BillId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "bill",
        {
          id: billId,
          status: "canceled",
          canceledAt: Date.now(),
        },
        options
      )
    )

    return billId
  }

export const closeBillAsPaid =
  (deps: EvoluDep) =>
  async (billId: BillId): Promise<BillId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "bill",
        {
          id: billId,
          status: "paid",
          closedAt: Date.now(),
        },
        options
      )
    )

    return billId
  }
