import { confirmBillClosedDespiteCancellation } from "@payky/core/modules/bill/bill-actions"
import type { BillId } from "@payky/core/modules/bill/bill-types"
import { useState } from "react"
import { useRequirePermission } from "../../core/use-access.ts"
import { useRunToast } from "../../hooks/use-run-toast.ts"
import { useToast } from "../../hooks/use-toast.ts"
import { useTranslation } from "../../hooks/use-translation.ts"

/**
 * The two actions that resolve the "discarded, but its payments already cover
 * it" collision (docs/bill-payment-states.md); native counterpart of web's
 * hook of the same name, shared by the bill screen and the activity detail.
 * Confirming despite a cancellation is `sell` (access/0002), checked here
 * because the activity detail sits under an `activity` route. `refund` is
 * web's stub: a canceled payment is not refundable (`RefundPaymentNotPaid`).
 */
export function useBillCancellationCollisionActions(billId: BillId) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const toast = useToast()
  const { require } = useRequirePermission()
  const [pending, setPending] = useState(false)

  const confirmClosed = async () => {
    if (
      !(await require("sell", "access.action.confirmClosedDespiteCancellation"))
    )
      return
    setPending(true)
    await runToast(async (run) => {
      const result = await run(confirmBillClosedDespiteCancellation(billId))
      if (!result.ok) return "bill.collision.markClosed.error"
    })
    setPending(false)
  }

  const refund = () => toast.error(t("bill.collision.refund.comingSoon"))

  return { pending, confirmClosed, refund }
}
