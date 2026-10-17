import {
  acknowledgePaymentExcessSettlement,
  confirmPaymentPaidDespiteCancellation,
} from "@payky/core/modules/payment/payment-actions"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { useState } from "react"
import { useRequirePermission } from "../../core/use-access.ts"
import { useRunToast } from "../../hooks/use-run-toast.ts"
import { useToast } from "../../hooks/use-toast.ts"
import { useTranslation } from "../../hooks/use-translation.ts"

/**
 * The actions that resolve a payment's two collisions, as web's
 * `payment-detail.tsx` does: marking a canceled-but-funded payment paid is
 * `sell`, acknowledging an excess settlement is `refund` (access/0002).
 * `refund` is web's stub, as in `useBillCancellationCollisionActions`.
 */
export function usePaymentCollisionActions(paymentId: PaymentId) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const toast = useToast()
  const { require } = useRequirePermission()
  const [resolvePending, setResolvePending] = useState(false)
  const [excessResolvePending, setExcessResolvePending] = useState(false)

  const confirmPaid = async () => {
    if (
      !(await require("sell", "access.action.confirmPaidDespiteCancellation"))
    )
      return
    setResolvePending(true)
    await runToast(async (run) => {
      const result = await run(confirmPaymentPaidDespiteCancellation(paymentId))
      if (!result.ok) return "paymentDetail.collision.markPaid.error"
    })
    setResolvePending(false)
  }

  const acknowledgeExcess = async () => {
    if (!(await require("refund", "access.action.acknowledgeExcess"))) return
    setExcessResolvePending(true)
    await runToast(async (run) => {
      const result = await run(acknowledgePaymentExcessSettlement(paymentId))
      if (!result.ok) return "paymentDetail.excessCollision.acknowledge.error"
    })
    setExcessResolvePending(false)
  }

  const refund = () =>
    toast.error(t("paymentDetail.collision.refund.comingSoon"))

  return {
    resolvePending,
    excessResolvePending,
    confirmPaid,
    acknowledgeExcess,
    refund,
  }
}
