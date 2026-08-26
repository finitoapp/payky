import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"

import { TablesOverviewPage } from "@/features/tables/tables-overview-page.tsx"

export const Route = createFileRoute("/_terminal/tables")({
  component: TablesRoute,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function TablesRoute() {
  return (
    <Suspense fallback={null}>
      <TablesOverviewPage />
    </Suspense>
  )
}
