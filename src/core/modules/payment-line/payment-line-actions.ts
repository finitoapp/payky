import { createIdFromString, type MutationOptions } from "@evolu/common"

import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { ItemId } from "@/core/modules/item/item-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import type { ItemLineType } from "@/core/modules/shared/schema.ts"
import { removeUndefinedValues } from "@/core/modules/shared/utils.ts"
import type { PaymentLineRow } from "./payment-line.ts"
import type { PaymentLineId } from "./payment-line-types.ts"

interface PaymentLineIdentityInput {
  readonly paymentId: PaymentId
  readonly catalogItemId: CatalogItemId | null
  readonly itemId: ItemId
  readonly type: ItemLineType
}

/**
 * Deterministic, not random — re-snapshotting the same payment (e.g. a
 * retried write) reproduces the same row ids instead of duplicating lines.
 */
export const createPaymentLineId = (
  input: PaymentLineIdentityInput
): PaymentLineId =>
  createIdFromString<"PaymentLine">(
    JSON.stringify({
      paymentId: input.paymentId,
      catalogItemId: input.catalogItemId,
      itemId: input.itemId,
      type: input.type,
    })
  )

/**
 * Inserts already-computed payment line rows. Takes the caller's own
 * `MutationOptions` so the writes can join an existing mutation batch
 * instead of always opening a new one.
 */
export const insertPaymentLineRows = (
  evolu: EvoluDep["evolu"],
  lines: ReadonlyArray<Omit<PaymentLineRow, "id">>,
  options: MutationOptions
): void => {
  for (const line of lines) {
    evolu.insert(
      "paymentLine",
      removeUndefinedValues({
        ...line,
        id: createPaymentLineId({
          paymentId: line.paymentId,
          catalogItemId: line.catalogItemId,
          itemId: line.itemId,
          type: line.type,
        }),
      }),
      options
    )
  }
}

/**
 * Freezes a bill's current line-item summaries as `paymentLine` rows tied to
 * `paymentId` — a snapshot of what the bill looked like, from this device's
 * point of view, the instant this payment was created. `payment.amount` is
 * fixed at creation and never renegotiated, but the bill's live total can
 * still drift after that (see docs/bill-payment-states.md's "Bill payment
 * coverage" section) — this is what lets the payment detail page later show
 * *what* changed, not just that the amounts no longer match.
 *
 * Deliberately not derived from `billLine.createdAt` after the fact: under
 * CRDT/multi-device sync, a device can create a payment before it has synced
 * an earlier (by timestamp) edit from another device, so filtering the
 * ledger by "created before this payment" would include changes this device
 * never actually saw. Only capturing the actual computed summaries *at
 * write time* is reliable.
 */
export const snapshotBillLinesForPayment = (
  evolu: EvoluDep["evolu"],
  paymentId: PaymentId,
  summaries: ReadonlyArray<BillLineSummary>,
  options: MutationOptions
): void => {
  insertPaymentLineRows(
    evolu,
    summaries.map((summary) => ({
      paymentId,
      billId: summary.billId,
      catalogItemId: summary.catalogItemId,
      itemId: summary.itemId,
      type: summary.type,
      quantity: summary.quantity,
      totalAmount: summary.totalAmount,
    })),
    options
  )
}
