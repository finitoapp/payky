import { categoryGroups } from "@payky/app-shared/stats-sections"
import {
  categorySalesQuery,
  itemSalesQuery,
  keypadSalesQuery,
} from "@payky/core/modules/sales-stats/sales-stats-queries"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import { StatsSection } from "./stats-section.tsx"
import { TopCategories } from "./top-categories.tsx"
import { TopItems } from "./top-items.tsx"
import { type SalesStats, useStatsRows } from "./use-sales-stats.ts"

/**
 * Top items and top categories in one card, a tab each. A period with only
 * one of them (keypad sales have no items) shows it without the tabs. The
 * note says why none of it adds up to net revenue.
 */
export function TopSales({ stats }: { readonly stats: SalesStats }) {
  const { t } = useTranslation()
  const { range } = stats.ranges
  const itemRows = useStatsRows("itemSales", itemSalesQuery, range, stats.live)
  const categoryRows = useStatsRows(
    "categorySales",
    categorySalesQuery,
    range,
    stats.live
  )
  const keypadRows = useStatsRows(
    "keypadSales",
    keypadSalesQuery,
    range,
    stats.live
  )

  if (
    itemRows === undefined ||
    categoryRows === undefined ||
    keypadRows === undefined
  ) {
    return null
  }

  const groups = categoryGroups({
    categoryRows,
    keypadRows,
    accountCurrency: stats.accountCurrency,
  })
  const items =
    itemRows.length === 0 ? null : (
      <TopItems rows={itemRows} accountCurrency={stats.accountCurrency} />
    )
  const categories =
    groups.length === 0 ? null : <TopCategories groups={groups} />

  if (items === null && categories === null) return null

  return (
    <StatsSection
      title={t("stats.top.title")}
      note={t("stats.categories.note")}
    >
      {items === null || categories === null ? (
        (items ?? categories)
      ) : (
        // The vendored `Tabs` stacks its list over the panels with
        // `data-horizontal:`, which Base UI's `data-orientation` never
        // matches; `flex-col` and `h-8` do here what those variants meant to.
        <Tabs defaultValue="items" className="flex-col gap-4">
          <TabsList className="h-8 w-full">
            <TabsTrigger value="items">{t("stats.top.items")}</TabsTrigger>
            <TabsTrigger value="categories">
              {t("stats.top.categories")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="items">{items}</TabsContent>
          <TabsContent value="categories">{categories}</TabsContent>
        </Tabs>
      )}
    </StatsSection>
  )
}
