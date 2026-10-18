import { withdrawalStatusKey } from "@payky/app-shared/withdraw-display"
import type { WithdrawalView } from "@payky/core/modules/withdraw/withdraw-queries"
import { LoaderCircleIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import { withdrawalStatusBadgeClassName } from "./withdraw-display.ts"

export function WithdrawalStatusBadge({
  view,
}: {
  readonly view: WithdrawalView
}) {
  const { t } = useTranslation()
  return (
    <Badge className={withdrawalStatusBadgeClassName(view.state.status)}>
      {view.state.status === "pending" ? (
        <LoaderCircleIcon className="animate-spin" aria-hidden />
      ) : null}
      {t(withdrawalStatusKey(view))}
    </Badge>
  )
}
