import type { BillStatus } from "@/core/modules/bill/bill-utils.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * How a `BillStatus` renders as a badge, shared by the bill detail page and
 * the payment detail page's bill card — both show the same domain enum, so
 * they showed the same two maps, character for character.
 *
 * `canceled` maps to `null`, not a class: a canceled bill gets no badge.
 */
export const billStatusBadgeClassName = {
  open: "bg-warning/10 text-warning",
  closed: "bg-success/10 text-success",
  canceled: null,
} satisfies Record<BillStatus, string | null>

export const billStatusLabelKey = {
  open: "bill.status.open",
  closed: "bill.status.closed",
  canceled: "bill.status.canceled",
} satisfies Record<BillStatus, TranslationKey>
