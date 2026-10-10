import { createFileRoute } from "@tanstack/react-router"

import { BillDetailPage } from "@/features/activity/activity-pages.tsx"

export const Route = createFileRoute("/_terminal/activity_/bills_/$billId")({
  component: BillDetailRoute,
  staticData: {
    access: "activity",
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function BillDetailRoute() {
  const { billId } = Route.useParams()

  return <BillDetailPage billId={billId} />
}
