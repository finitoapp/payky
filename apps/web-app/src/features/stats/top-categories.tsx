import type { categoryGroups } from "@payky/app-shared/stats-sections"
import { useTranslation } from "@/hooks/use-translation.ts"
import { CurrencyGroup, StatsBarRow, useStatsMoney } from "./stats-section.tsx"

/**
 * Revenue per catalog category, "Uncategorized" and the keypad's sales
 * without items included.
 */
export function TopCategories({
  groups,
}: {
  readonly groups: ReturnType<typeof categoryGroups>
}) {
  const { t } = useTranslation()
  const money = useStatsMoney()

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <CurrencyGroup
          key={group.currency}
          currency={group.currency}
          showCurrency={groups.length > 1}
        >
          {group.rows.map((row) => (
            <StatsBarRow
              key={row.key}
              label={
                row.keypad
                  ? t("stats.categories.keypad")
                  : (row.name ?? t("stats.categories.uncategorized"))
              }
              value={money(row.amount, group.currency)}
              share={row.share}
            />
          ))}
        </CurrencyGroup>
      ))}
    </div>
  )
}
