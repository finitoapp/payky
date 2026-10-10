import { createFileRoute } from "@tanstack/react-router"

import { PaymentDetailPage } from "@/features/activity/activity-pages.tsx"

export const Route = createFileRoute("/_terminal/activity_/$paymentId")({
  component: PaymentDetailRoute,
  staticData: {
    access: "activity",
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function PaymentDetailRoute() {
  const { paymentId } = Route.useParams()

  return <PaymentDetailPage paymentId={paymentId} />
}
