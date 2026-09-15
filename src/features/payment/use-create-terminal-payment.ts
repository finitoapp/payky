import { useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { useCallback } from "react"
import { toast } from "sonner"

import { accountAtom } from "@/atoms/account.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { createPreparedPayment } from "@/core/modules/payment/payment-preparation-actions.ts"
import type {
  FiatCurrency,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Prepares a payment and navigates to it. Failure is logged and toasted here
 * rather than signalled back: all three callers wanted the same toast, so the
 * boolean bought nothing and a fourth caller forgetting to check it would have
 * failed silently.
 */
export function useCreateTerminalPayment() {
  const appRun = useAppRun()
  const console = useConsole()
  const navigate = useNavigate()
  const jotaiStore = useStore()
  const { t } = useTranslation()

  return useCallback(
    async ({
      amount,
      currency,
      tipAmount,
      billId = null,
    }: {
      readonly amount: NonNegativeInteger
      readonly currency: FiatCurrency
      readonly tipAmount: NonNegativeInteger
      readonly billId?: BillId | null
    }): Promise<void> => {
      const { device } = await jotaiStore.get(accountAtom)

      await using run = appRun()

      const result = await run(
        createPreparedPayment({
          deviceId: device.id,
          billId,
          tableId: null,
          amount,
          currency,
          tipAmount,
          canceledAt: null,
        })
      )

      if (!result.ok) {
        console.error("Failed to create prepared payment", result.error)
        toast.error(t("payment.create.error"))
        return
      }

      await navigate({
        to: "/payment/$paymentId",
        params: {
          paymentId: result.value,
        },
      })
    },
    [appRun, console, jotaiStore, navigate, t]
  )
}
