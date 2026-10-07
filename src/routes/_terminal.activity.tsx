import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"
import { FadeHeader } from "@/components/fade-header.tsx"
import { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import { StationId } from "@/core/modules/station/station-types.ts"
import { ActivityFilters } from "@/features/activity/activity-filters.tsx"
import { ActivityHistorySkeleton } from "@/features/activity/activity-history-skeleton.tsx"
import { ActivityTabs } from "@/features/activity/activity-tabs.tsx"
import { PaymentHistory } from "@/features/activity/payment-history.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

// A stale or hand-typed id only drops that filter rather than throwing into
// the global error boundary.
const ActivitySearchSchema = z.object({
  stationId: StationId.optional().catch(undefined),
  employeeId: EmployeeId.optional().catch(undefined),
})

export const Route = createFileRoute("/_terminal/activity")({
  component: ActivityPage,
  validateSearch: (search) => ActivitySearchSchema.parse(search),
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function ActivityPage() {
  const { t } = useTranslation()
  const filter = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("activity.title")} />

      <section className="flex flex-col gap-8">
        <ActivityTabs active="payments" />
        <div className="flex flex-col gap-4">
          <Suspense fallback={null}>
            <ActivityFilters
              filter={filter}
              onFilterChange={(next) =>
                void navigate({ search: next, replace: true })
              }
            />
          </Suspense>
          <Suspense fallback={<ActivityHistorySkeleton />}>
            <PaymentHistory filter={filter} />
          </Suspense>
        </div>
      </section>
    </>
  )
}
