import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { signalFigures } from "@payky/app-shared/stats-sections"
import {
  type SalesSignal,
  signalsQuery,
} from "@payky/core/modules/sales-stats/sales-stats-queries"
import { Text, XStack, YStack } from "tamagui"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { CurrencyGroup, StatsSection, useStatsMoney } from "./stats-section.tsx"
import { type SalesStats, useStatsRows } from "./use-sales-stats.ts"

const signalLabelKeys = {
  canceledPayment: "stats.signals.canceledPayment",
  canceledBill: "stats.signals.canceledBill",
  manualIban: "stats.signals.manualIban",
} satisfies Record<SalesSignal, TranslationKey>

/**
 * Cancelled payments, cancelled bills and bank transfers confirmed by hand
 * in the period: count and amount each, numbers only (no links).
 */
export function Signals({ stats }: { readonly stats: SalesStats }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = useStatsMoney()
  const rows = useStatsRows(
    "signals",
    signalsQuery,
    stats.ranges.range,
    stats.live
  )

  if (rows === undefined) return null

  const groups = signalFigures(rows, stats.accountCurrency)

  return (
    <StatsSection title={t("stats.signals.title")}>
      {groups.map((group) => (
        <CurrencyGroup
          key={group.currency}
          currency={group.currency}
          showCurrency={groups.length > 1}
        >
          <YStack gap="1.5">
            {group.signals.map(({ signal, count, amount }) => (
              <XStack key={signal} justify="space-between" gap="2">
                <Text flex={1}>{t(signalLabelKeys[signal])}</Text>
                <Text
                  fontWeight={count === 0 ? "400" : "600"}
                  color={count === 0 ? "muted-foreground" : "color"}
                >
                  {t("stats.signals.value", {
                    count: count.toLocaleString(locale),
                    amount: money(amount, group.currency),
                  })}
                </Text>
              </XStack>
            ))}
          </YStack>
        </CurrencyGroup>
      ))}
    </StatsSection>
  )
}
