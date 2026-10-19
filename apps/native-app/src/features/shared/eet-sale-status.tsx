import { sqliteTrue } from "@evolu/common"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { useNow } from "@payky/app-shared/use-now"
import type { DeviceId } from "@payky/core/modules/device/device-types"
import type {
  EetAttemptResult,
  EetDateTime,
  EetEnvironment,
  EetSaleStatus,
  EetUnsupportedReason,
} from "@payky/core/modules/eet/eet-types"
import {
  deriveEetSaleStatus,
  getEetPriorityEndsAt,
  getEetRecordingDeviceWaitEndsAt,
  getEetSaleOverdueAt,
  isEetSaleOverdue,
} from "@payky/core/modules/eet/eet-utils"
import type { TimestampMs } from "@payky/core/modules/shared/schema"
import { Badge } from "../../components/ui/badge.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import type { ThemeColor } from "../../theme/themes.ts"

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

const eetSaleStatusColors = {
  pending: { background: "warning-10", text: "warning" },
  confirmed: { background: "success-10", text: "success" },
  testConfirmed: { background: "info-10", text: "info" },
  rejected: { background: "destructive-10", text: "destructive" },
  unsupported: { background: "destructive-10", text: "destructive" },
} as const satisfies Record<
  EetSaleStatus,
  { readonly background: ThemeColor; readonly text: ThemeColor }
>

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

/**
 * Until when another device keeps its priority to send this sale, as web's:
 * `null` once this device may send it.
 */
export function useEetRecordingDeviceWait({
  attempts,
  recordingDeviceId,
  deviceId,
  startsAt,
}: {
  readonly attempts: {
    readonly attemptStartedAt: TimestampMs | null
    readonly lastAttemptAt: TimestampMs | null
  }
  readonly recordingDeviceId: DeviceId
  readonly deviceId: DeviceId
  readonly startsAt: TimestampMs | null
}): TimestampMs | null {
  const now = useNow([
    startsAt === null ? null : getEetPriorityEndsAt(startsAt),
  ])
  return startsAt === null
    ? null
    : getEetRecordingDeviceWaitEndsAt({
        attempts,
        recordingDeviceId,
        deviceId,
        startsAt,
        now,
      })
}

export function EetSaleStatusLabel({
  sale,
}: {
  readonly sale: EetSaleStatusFields
}) {
  const { t } = useTranslation()
  const { status, isOverdue } = useEetSaleStatus(sale)
  const colors = eetSaleStatusColors[status]

  return (
    <Badge
      variant="secondary"
      bg={colors.background}
      labelColor={colors.text}
      label={`${t(eetSaleStatusLabelKey[status])}${isOverdue ? ` · ${t("eet.status.overdue")}` : ""}`}
      testID="eet-sale-status"
    />
  )
}
