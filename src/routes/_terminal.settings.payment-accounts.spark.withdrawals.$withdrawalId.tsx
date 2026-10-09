import { createFileRoute } from "@tanstack/react-router"

import { FadeHeader } from "@/components/fade-header.tsx"
import { WithdrawDetail } from "@/features/withdraw/withdraw-detail-page.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

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
  const { t } = useTranslation()
  const { withdrawalId } = Route.useParams()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("withdraw.detail.title")} />
      <WithdrawDetail withdrawalId={withdrawalId} />
    </>
  )
}
