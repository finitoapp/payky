import { useState } from "react"
import { toast } from "sonner"

import { confirmBillClosedDespiteCancellation } from "@/core/modules/bill/bill-actions.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { useRequirePermission } from "@/hooks/use-access.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The two actions that resolve the "discarded, but its payments already cover
 * it" collision from docs/bill-payment-states.md.
 *
 * `bill-cancellation-collision-panel.tsx` and `bill-page.tsx`'s
 * `BillCancellationCollisionMessage` render them in deliberately different
 * layouts — one card section, one whole screen — around identical behaviour.
 * `refund` is still a stub, and keeping it here means it grows a real
 * implementation once rather than twice.
 */
export function useBillCancellationCollisionActions(billId: BillId) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const { require } = useRequirePermission()
  const [pending, setPending] = useState(false)

  // Here, not at the call sites: the activity detail renders this under an
  // `activity` route, and confirming despite a cancellation is `sell`
  // (access/0002).
  const confirmClosed = async () => {
    if (
      !(await require("sell", "access.action.confirmClosedDespiteCancellation"))
    )
      return
    setPending(true)
    try {
      await using run = appRun()
      const result = await run(confirmBillClosedDespiteCancellation(billId))

      if (!result.ok) {
        toast.error(t("bill.collision.markClosed.error"))
      }
    } finally {
      setPending(false)
    }
  }

  const refund = () => {
    toast.info(t("bill.collision.refund.comingSoon"))
  }

  return { pending, confirmClosed, refund }
}
