import type { IndexesConfig } from "@evolu/common/local-first"

import { BillId } from "@/core/modules/bill/bill-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  PositiveIntegerSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { TableId } from "@/core/modules/table/table-types.ts"

/**
 * No `status` column — `open`/`closed`/`canceled` is derived at read time
 * from `canceledAt`/`confirmedClosedAt` and payment coverage (see
 * `deriveBillStatus` in `bill-utils.ts`), the same way a payment's display
 * status has always been derived rather than stored. See
 * docs/bill-payment-states.md.
 *
 * - `canceledAt` — set once, never cleared. An explicit human decision to
 *   discard the bill.
 * - `confirmedClosedAt` — set once, never cleared, by
 *   `confirmBillClosedDespiteCancellation`. Staff's explicit resolution of
 *   the canceled+funded collision: acknowledges that the bill's payments
 *   already cover its total despite the cancellation, and flips the
 *   *derived* status from `canceled` to `closed`. Mirrors
 *   `payment.confirmedPaidAt`.
 * - `closedAt` — a best-effort, self-healing *cache*, not a source of
 *   truth: written (idempotently) whenever a claim brings the bill's
 *   coverage out of `underpaid`, regardless of `canceledAt`. Nothing that
 *   decides money-correctness (guards, derived status) reads it — it
 *   exists only so `openBillsQuery` can filter cheaply without scanning
 *   every bill's coverage. It can lag behind the true derived status after
 *   a rare multi-device race (two split payments confirmed nearly
 *   simultaneously offline); that only means a bill briefly lingers in the
 *   "open" list a bit longer, never a wrong guard decision.
 */
export const bill = {
  id: BillId,
  deviceId: DeviceId.nullable(),
  displayNumber: PositiveIntegerSchema,
  label: NonEmptyString255Schema.nullable(),
  tableId: TableId.nullable(),
  currency: FiatCurrencySchema,
  closedAt: TimestampMsSchema.nullable(),
  canceledAt: TimestampMsSchema.nullable(),
  confirmedClosedAt: TimestampMsSchema.nullable(),
} as const

export const billIndexes = ((create) => [
  create("bill_tableId").on("bill").column("tableId"),
  create("bill_canceledAt_closedAt")
    .on("bill")
    .columns(["canceledAt", "closedAt"]),
]) satisfies IndexesConfig

export type BillRow = InferTable<typeof bill>
