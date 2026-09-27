import { sqliteTrue } from "@evolu/common"

import { Badge } from "@/components/ui/badge.tsx"
import type {
  EetAttemptResult,
  EetDateTime,
  EetEnvironment,
  EetSaleStatus,
  EetUnsupportedReason,
} from "@/core/modules/eet/eet-types.ts"
import {
  deriveEetSaleStatus,
  getEetSaleOverdueAt,
  isEetSaleOverdue,
} from "@/core/modules/eet/eet-utils.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

interface EetSaleStatusFields {
  readonly environment: EetEnvironment
  readonly saleAt: EetDateTime
  readonly unsupportedReason: EetUnsupportedReason | null
  readonly lastAttemptResult: EetAttemptResult | null
  readonly pok: string | null
  readonly isTest: 0 | 1 | null
}

const eetSaleStatusLabelKey = {
  pending: "eet.status.pending",
  confirmed: "eet.status.confirmed",
  testConfirmed: "eet.status.testConfirmed",
  rejected: "eet.status.rejected",
  unsupported: "eet.status.unsupported",
} satisfies Record<EetSaleStatus, TranslationKey>

const eetSaleStatusBadgeClassName = {
  pending: "bg-warning/10 text-warning",
  confirmed: "bg-success/10 text-success",
  testConfirmed: "bg-info/10 text-info",
  rejected: "bg-destructive/10 text-destructive",
  unsupported: "bg-destructive/10 text-destructive",
} satisfies Record<EetSaleStatus, string>

export function useEetSaleStatus(sale: EetSaleStatusFields) {
  const now = useNow([getEetSaleOverdueAt(sale.saleAt)])
  const status = deriveEetSaleStatus({
    confirmation:
      sale.pok === null ? null : { isTest: sale.isTest === sqliteTrue },
    environment: sale.environment,
    unsupportedReason: sale.unsupportedReason,
    lastAttemptResult: sale.lastAttemptResult,
  })

  return {
    status,
    isOverdue: isEetSaleOverdue({ status, saleAt: sale.saleAt, now }),
  }
}

export function EetSaleStatusBadge({
  sale,
  className,
}: {
  readonly sale: EetSaleStatusFields
  readonly className?: string
}) {
  const { t } = useTranslation()
  const { status, isOverdue } = useEetSaleStatus(sale)

  return (
    <Badge
      variant="secondary"
      className={cn(eetSaleStatusBadgeClassName[status], className)}
      data-testid="eet-sale-status"
    >
      {t(eetSaleStatusLabelKey[status])}
      {isOverdue ? ` · ${t("eet.status.overdue")}` : null}
    </Badge>
  )
}
