import { Badge } from "@/components/ui/badge.tsx"
import type { RefundState } from "@/core/modules/refund/refund-types.ts"
import {
  deriveRefundState,
  type PaymentRefundSummary,
} from "@/core/modules/refund/refund-utils.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

const refundStateLabelKey = {
  partial: "refund.state.partial",
  full: "refund.state.full",
} satisfies Record<Exclude<RefundState, "none">, TranslationKey>

export function RefundBadge({
  summary,
  className,
}: {
  readonly summary: PaymentRefundSummary | undefined
  readonly className?: string
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  if (summary === undefined) return null

  const state = deriveRefundState(summary)
  if (state === "none") return null

  return (
    <Badge
      variant="secondary"
      className={cn("bg-warning/10 text-warning", className)}
      data-testid="refund-badge"
    >
      {t(refundStateLabelKey[state], {
        amount: formatMoney(
          { value: summary.refundedAmount, currency: summary.currency },
          locale
        ),
      })}
    </Badge>
  )
}
