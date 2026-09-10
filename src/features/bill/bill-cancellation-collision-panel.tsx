import { AlertTriangleIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button.tsx"
import { confirmBillClosedDespiteCancellation } from "@/core/modules/bill/bill-actions.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * "This bill was discarded, but its payments already cover it" — the
 * collision from docs/bill-payment-states.md, with the two actions that
 * resolve it. Rendered wherever `useBillStatus` reports
 * `hasCancellationCollision` for a bill shown as a card section:
 * `bill-detail.tsx` and `payment-detail.tsx`'s bill card.
 *
 * `bill-page.tsx`'s `BillCancellationCollisionMessage` deliberately doesn't
 * use this. It's the whole screen rather than one section of a card, so it
 * wraps the same two actions in a different layout — the bill's total and
 * links to the payments that funded it — and states the warning through
 * `Alert` instead.
 */
export function BillCancellationCollisionPanel({
  billId,
}: {
  readonly billId: BillId
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const [resolvePending, setResolvePending] = useState(false)

  const handleConfirmClosedDespiteCancellation = async () => {
    setResolvePending(true)
    try {
      await using run = appRun()
      const result = await run(confirmBillClosedDespiteCancellation(billId))

      if (!result.ok) {
        toast.error(t("bill.collision.markClosed.error"))
      }
    } finally {
      setResolvePending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-warning">
            {t("bill.collision.title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("bill.collision.description")}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="h-12 flex-1"
          disabled={resolvePending}
          onClick={() => void handleConfirmClosedDespiteCancellation()}
        >
          {t("bill.collision.markClosed")}
        </Button>
        <Button
          variant="outline"
          className="h-12 flex-1"
          onClick={() => toast.info(t("bill.collision.refund.comingSoon"))}
        >
          {t("bill.collision.refund")}
        </Button>
      </div>
    </div>
  )
}
