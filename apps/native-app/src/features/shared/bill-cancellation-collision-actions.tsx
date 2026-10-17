import type { BillId } from "@payky/core/modules/bill/bill-types"
import { YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import { useBillCancellationCollisionActions } from "./use-bill-cancellation-collision-actions.ts"

/** "Mark as closed" and "Refund" for a bill's cancellation collision. */
export function BillCancellationCollisionActions({
  billId,
}: {
  readonly billId: BillId
}) {
  const { t } = useTranslation()
  const { pending, confirmClosed, refund } =
    useBillCancellationCollisionActions(billId)

  return (
    <YStack gap="2">
      <AppButton
        label={t("bill.collision.markClosed")}
        pending={pending}
        onPress={() => void confirmClosed()}
      />
      <AppButton
        variant="secondary"
        label={t("bill.collision.refund")}
        onPress={refund}
      />
    </YStack>
  )
}
