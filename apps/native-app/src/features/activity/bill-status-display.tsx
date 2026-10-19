import type { BillStatus } from "@payky/core/modules/bill/bill-types"
import { Badge } from "../../components/ui/badge.tsx"

/**
 * Web's `bill-status-display.ts` (`billStatusBadgeClassName`): a secondary
 * badge tinted by status; a canceled bill gets the plain destructive badge.
 */
const billBadgeTints = {
  open: { bg: "warning-10", color: "warning" },
  closed: { bg: "success-10", color: "success" },
  canceled: null,
} as const

export function BillStatusBadge({
  status,
  label,
}: {
  readonly status: BillStatus
  /** Already translated. */
  readonly label: string
}) {
  const tint = billBadgeTints[status]
  return tint === null ? (
    <Badge variant="destructive" label={label} />
  ) : (
    <Badge
      variant="secondary"
      bg={tint.bg}
      labelColor={tint.color}
      label={label}
    />
  )
}
