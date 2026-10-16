import { createFileRoute } from "@tanstack/react-router"

import { WithdrawHistoryPage } from "@/features/withdraw/withdraw-history-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/cashu/withdrawals/"
)({
  component: CashuWithdrawHistoryRoute,
  staticData: {
    access: "admin",
  },
})

function CashuWithdrawHistoryRoute() {
  return <WithdrawHistoryPage method="cashu" />
}
