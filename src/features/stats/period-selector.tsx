import { Input } from "@/components/ui/input.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import type { StatsPeriod } from "@/core/modules/sales-stats/sales-stats-types.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { type StatsSearch, statsPeriodKinds } from "./stats-search.ts"

const periodLabelKeys = {
  today: "stats.period.today",
  yesterday: "stats.period.yesterday",
  last7Days: "stats.period.last7Days",
  monthToDate: "stats.period.monthToDate",
  custom: "stats.period.custom",
} satisfies Record<StatsPeriod["kind"], TranslationKey>

/**
 * Today / Yesterday / 7 days / Month / Custom. Custom shows two native date
 * fields, both days inclusive, with no limit on the span.
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
    <div className="flex flex-col gap-3">
      <ToggleGroup<StatsPeriod["kind"]>
        aria-label={t("stats.period.label")}
        className="grid w-full grid-cols-5"
        variant="outline"
        size="sm"
        spacing={1}
        value={[period.kind]}
        // Pressing the selected item again empties the value; keep it.
        onValueChange={([kind]) => {
          if (kind !== undefined) onChange({ period: kind })
        }}
      >
        {statsPeriodKinds.map((kind) => (
          <ToggleGroupItem key={kind} value={kind} className="px-1 text-xs">
            {t(periodLabelKeys[kind])}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {period.kind === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <label
            htmlFor="stats-period-from"
            className="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            {t("stats.period.from")}
            <Input
              id="stats-period-from"
              type="date"
              value={period.from}
              max={period.to}
              onChange={(event) => {
                if (event.target.value === "") return
                onChange({
                  period: "custom",
                  from: event.target.value,
                  to: period.to,
                })
              }}
            />
          </label>
          <label
            htmlFor="stats-period-to"
            className="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            {t("stats.period.to")}
            <Input
              id="stats-period-to"
              type="date"
              value={period.to}
              min={period.from}
              onChange={(event) => {
                if (event.target.value === "") return
                onChange({
                  period: "custom",
                  from: period.from,
                  to: event.target.value,
                })
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
