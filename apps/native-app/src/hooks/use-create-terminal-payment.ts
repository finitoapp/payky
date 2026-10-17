import type { BillId } from "@payky/core/modules/bill/bill-types"
import { createPreparedPayment } from "@payky/core/modules/payment/payment-preparation-actions"
import type {
  FiatCurrency,
  NonNegativeInteger,
} from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { accountAtom } from "../atoms/account.ts"
import { nativeConsole } from "../core/native-runtime.ts"
import { useRunToast } from "./use-run-toast.ts"

/**
 * Prepares a payment and opens it, as web's `useCreateTerminalPayment`:
 * failure is logged and toasted here, not signalled back. The route gate
 * already requires `sell` (access/0002), as on web.
 */
export function useCreateTerminalPayment() {
  const runToast = useRunToast()
  const { device } = useAtomValue(accountAtom)

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
          nativeConsole.error("Failed to create prepared payment", result.error)
          return "payment.create.error"
        }

        router.push({
          pathname: "/payment/[paymentId]",
          params: { paymentId: result.value },
        })
      })
    },
    [device.id, runToast]
  )
}
