import { sqliteTrue } from "@evolu/common"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { useNow } from "@payky/app-shared/use-now"
import type {
  EetAttemptResult,
  EetDateTime,
  EetEnvironment,
  EetSaleStatus,
  EetUnsupportedReason,
} from "@payky/core/modules/eet/eet-types"
import {
  deriveEetSaleStatus,
  getEetSaleOverdueAt,
  isEetSaleOverdue,
} from "@payky/core/modules/eet/eet-utils"
import { Text } from "tamagui"
import { useTranslation } from "../../hooks/use-translation.ts"

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

const eetSaleStatusColor = {
  pending: "orange-600",
  confirmed: "green-600",
  testConfirmed: "blue-600",
  rejected: "red-600",
  unsupported: "red-600",
} as const satisfies Record<EetSaleStatus, string>

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

export function EetSaleStatusLabel({
  sale,
}: {
  readonly sale: EetSaleStatusFields
}) {
  const { t } = useTranslation()
  const { status, isOverdue } = useEetSaleStatus(sale)

  return (
    <Text
      fontSize={13}
      fontWeight="600"
      color={eetSaleStatusColor[status]}
      testID="eet-sale-status"
    >
      {t(eetSaleStatusLabelKey[status])}
      {isOverdue ? ` · ${t("eet.status.overdue")}` : ""}
    </Text>
  )
}
