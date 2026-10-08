import { Link } from "@tanstack/react-router"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx"
import { stationsQuery } from "@/core/modules/station/station-queries.ts"
import { useIsStation } from "@/hooks/use-account-kind.ts"
import { useOptionalEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

type ActivityTab = "payments" | "bills" | "stations"

/**
 * Navigates between `/activity` (payments) and `/activity/bills` — each tab
 * is its own route rather than `TabsContent`, so `value` only drives which
 * trigger renders as active; selecting a trigger navigates instead of
 * swapping local state. `replace` keeps switching tabs from stacking up in
 * history, so back always exits the screen instead of rewinding through tabs.
 *
 * A PoS station has only its own payments, so it gets no tabs; an owner with
 * stations gets their overview as a third.
 */
export function ActivityTabs({ active }: { readonly active: ActivityTab }) {
  const { t } = useTranslation()
  const isStation = useIsStation()
  const stations = useOptionalEvoluQuery(isStation ? null : stationsQuery).data
  if (isStation) return null

  return (
    <Tabs value={active}>
      <TabsList className="w-full">
        <TabsTrigger
          value="payments"
          nativeButton={false}
          render={<Link to="/activity" replace />}
        >
          {t("activity.tabs.payments")}
        </TabsTrigger>
        <TabsTrigger
          value="bills"
          nativeButton={false}
          render={<Link to="/activity/bills" replace />}
        >
          {t("activity.tabs.bills")}
        </TabsTrigger>
        {stations.length === 0 ? null : (
          <TabsTrigger
            value="stations"
            nativeButton={false}
            render={<Link to="/activity/stations" replace />}
          >
            {t("activity.tabs.stations")}
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  )
}
