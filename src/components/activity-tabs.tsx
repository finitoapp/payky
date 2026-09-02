import { Link } from "@tanstack/react-router"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export type ActivityTab = "payments" | "bills"

/**
 * Navigates between `/activity` (payments) and `/activity/bills` — each tab
 * is its own route rather than `TabsContent`, so `value` only drives which
 * trigger renders as active; selecting a trigger navigates instead of
 * swapping local state.
 */
export function ActivityTabs({ active }: { readonly active: ActivityTab }) {
  const { t } = useTranslation()

  return (
    <Tabs value={active}>
      <TabsList className="w-full">
        <TabsTrigger
          value="payments"
          nativeButton={false}
          render={<Link to="/activity" />}
        >
          {t("activity.tabs.payments")}
        </TabsTrigger>
        <TabsTrigger
          value="bills"
          nativeButton={false}
          render={<Link to="/activity/bills" />}
        >
          {t("activity.tabs.bills")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
