import { createFileRoute } from "@tanstack/react-router"

import { WithdrawPage } from "@/features/withdraw/withdraw-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/spark/withdraw"
)({
  component: WithdrawPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
