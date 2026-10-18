import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  type StatsSearch,
  statsPeriodKinds,
} from "@payky/app-shared/stats-search"
import type { StatsPeriod } from "@payky/core/modules/sales-stats/sales-stats-types"
import { useState } from "react"
import { XStack, YStack } from "tamagui"
import { z } from "zod"
import { AppButton } from "../../components/app-button.tsx"
import { Field } from "../../components/field.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

const periodLabelKeys = {
  today: "stats.period.today",
  yesterday: "stats.period.yesterday",
  last7Days: "stats.period.last7Days",
  monthToDate: "stats.period.monthToDate",
  custom: "stats.period.custom",
} satisfies Record<StatsPeriod["kind"], TranslationKey>

/**
 * Today / Yesterday / 7 days / Month / Custom. Custom takes two typed days
 * (`yyyy-mm-dd`, both inclusive, no limit on the span); a field applies once
 * it holds a real day.
 */
export function PeriodSelector({
  period,
  onChange,
}: {
  readonly period: StatsPeriod
  readonly onChange: (search: StatsSearch) => void
}) {
  const { t } = useTranslation()

  return (
    <YStack gap="3" accessibilityLabel={t("stats.period.label")}>
      <XStack gap="1" flexWrap="wrap">
        {statsPeriodKinds.map((kind) => (
          <YStack key={kind} flex={1} minW={64}>
            <AppButton
              label={t(periodLabelKeys[kind])}
              variant={period.kind === kind ? "primary" : "secondary"}
              onPress={() => {
                if (period.kind !== kind) onChange({ period: kind })
              }}
            />
          </YStack>
        ))}
      </XStack>
      {period.kind === "custom" ? (
        <XStack gap="3">
          <YStack flex={1}>
            <DayField
              label={t("stats.period.from")}
              value={period.from}
              onDay={(from) =>
                onChange({ period: "custom", from, to: period.to })
              }
            />
          </YStack>
          <YStack flex={1}>
            <DayField
              label={t("stats.period.to")}
              value={period.to}
              onDay={(to) =>
                onChange({ period: "custom", from: period.from, to })
              }
            />
          </YStack>
        </XStack>
      ) : null}
    </YStack>
  )
}

function DayField({
  label,
  value,
  onDay,
}: {
  readonly label: string
  readonly value: string
  readonly onDay: (day: string) => void
}) {
  const [draft, setDraft] = useState(value)

  return (
    <Field
      label={label}
      value={draft}
      placeholder="yyyy-mm-dd"
      keyboardType="numbers-and-punctuation"
      maxLength={10}
      onChangeText={(next) => {
        setDraft(next)
        if (z.iso.date().safeParse(next).success) onDay(next)
      }}
    />
  )
}
