import { Link } from "@tanstack/react-router"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

type ActivityTab = "payments" | "bills"

/**
 * Navigates between `/activity` (payments) and `/activity/bills` — each tab
 * is its own route rather than `TabsContent`, so `value` only drives which
 * trigger renders as active; selecting a trigger navigates instead of
 * swapping local state. `replace` keeps switching tabs from stacking up in
 * history, so back always exits the screen instead of rewinding through tabs.
 */
export function ActivityTabs({ active }: { readonly active: ActivityTab }) {
  const { t } = useTranslation()

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
      </TabsList>
    </Tabs>
  )
}
