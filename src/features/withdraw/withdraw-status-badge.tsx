import { LoaderCircleIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge.tsx"
import type { WithdrawalView } from "@/core/modules/withdraw/withdraw-queries.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import {
  withdrawalStatusBadgeClassName,
  withdrawalStatusKey,
} from "./withdraw-display.ts"

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
