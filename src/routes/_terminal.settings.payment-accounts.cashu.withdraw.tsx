import { createFileRoute } from "@tanstack/react-router"

import { CashuWithdrawPage } from "@/features/settings/cashu/cashu-withdraw-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/cashu/withdraw"
)({
  component: CashuWithdrawPage,
  staticData: { access: "admin" },
})
