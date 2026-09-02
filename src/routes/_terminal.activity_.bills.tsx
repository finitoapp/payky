import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { ActivityTabs } from "@/components/activity-tabs.tsx"
import { FadeHeader } from "@/components/fade-header.tsx"
import { BillHistory } from "@/features/bill/bill-history.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/activity_/bills")({
  component: ActivityBillsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-6 py-6",
    },
  },
})

function ActivityBillsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("activity.title")} />

      <section className="flex flex-col gap-8">
        <ActivityTabs active="bills" />
        <Suspense fallback={null}>
          <BillHistory />
        </Suspense>
      </section>
    </>
  )
}
