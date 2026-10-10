import { createFileRoute } from "@tanstack/react-router"

import { WithdrawDetailPage } from "@/features/withdraw/withdraw-detail-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/spark/withdrawals/$withdrawalId"
)({
  component: WithdrawDetailRoute,
  staticData: {
    access: "admin",
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function WithdrawDetailRoute() {
  const { withdrawalId } = Route.useParams()

  return <WithdrawDetailPage withdrawalId={withdrawalId} />
}
