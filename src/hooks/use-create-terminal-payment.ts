import { useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { useCallback } from "react"

import { accountAtom } from "@/atoms/account.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { createPreparedPayment } from "@/core/modules/payment/payment-preparation-actions.ts"
import type {
  FiatCurrency,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"

/**
 * Prepares a payment and navigates to it. Failure is logged and toasted here
 * rather than signalled back: all three callers wanted the same toast, so the
 * boolean bought nothing and a fourth caller forgetting to check it would have
 * failed silently.
 */
export function useCreateTerminalPayment() {
  const runToast = useRunToast()
  const console = useConsole()
  const navigate = useNavigate()
  const jotaiStore = useStore()

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

      await runToast(async (run) => {
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
          return "payment.create.error"
        }

        await navigate({
          to: "/payment/$paymentId",
          params: {
            paymentId: result.value,
          },
        })
      })
    },
    [console, jotaiStore, navigate, runToast]
  )
}
