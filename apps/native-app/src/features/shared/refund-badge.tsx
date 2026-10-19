import { refundBadgeLabel } from "@payky/app-shared/activity-history"
import type { PaymentRefundSummary } from "@payky/core/modules/refund/refund-utils"
import { Badge } from "../../components/ui/badge.tsx"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"

/** Web's `RefundBadge`: a warning-tinted secondary badge with the refunded part. */
export function RefundBadge({
  summary,
}: {
  readonly summary: PaymentRefundSummary | undefined
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const label = refundBadgeLabel(summary, t, locale)
  if (label === null) return null
  return (
    <Badge
      variant="secondary"
      bg="warning-10"
      labelColor="warning"
      label={label}
    />
  )
}
