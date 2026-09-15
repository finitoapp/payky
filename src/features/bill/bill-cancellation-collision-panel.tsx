import { CollisionAlert } from "@/components/collision-alert.tsx"
import { Button } from "@/components/ui/button.tsx"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { useBillCancellationCollisionActions } from "@/features/bill/use-bill-cancellation-collision-actions.ts"
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
 * links to the payments that funded it — around the same warning. Only the
 * layout differs: both drive `useBillCancellationCollisionActions`.
 */
export function BillCancellationCollisionPanel({
  billId,
}: {
  readonly billId: BillId
}) {
  const { t } = useTranslation()
  const { pending, confirmClosed, refund } =
    useBillCancellationCollisionActions(billId)

  return (
    <CollisionAlert
      title={t("bill.collision.title")}
      description={t("bill.collision.description")}
    >
      <Button
        className="h-12 flex-1"
        disabled={pending}
        onClick={() => void confirmClosed()}
      >
        {t("bill.collision.markClosed")}
      </Button>
      <Button variant="outline" className="h-12 flex-1" onClick={refund}>
        {t("bill.collision.refund")}
      </Button>
    </CollisionAlert>
  )
}
