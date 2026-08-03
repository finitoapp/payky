import { useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { useCallback } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { createPreparedPayment } from "@/core/modules/payment/payment-actions.ts"
import type {
  FiatCurrency,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"

export function useCreateTerminalPayment() {
  const appRun = useAppRun()
  const console = useConsole()
  const navigate = useNavigate()
  const jotaiStore = useStore()

  return useCallback(
    async ({
      amount,
      currency,
      tipAmount,
    }: {
      readonly amount: NonNegativeInteger
      readonly currency: FiatCurrency
      readonly tipAmount: NonNegativeInteger
    }): Promise<boolean> => {
      const { device } = await jotaiStore.get(accountAtom)

      await using run = appRun()

      const result = await run(
        createPreparedPayment({
          deviceId: device.id,
          billId: null,
          tableId: null,
          amount,
          currency,
          tipAmount,
          canceledAt: null,
        })
      )

      if (!result.ok) {
        console.error("Failed to create prepared payment", result.error)
        return false
      }

      await navigate({
        to: "/payment/$paymentId",
        params: {
          paymentId: result.value,
        },
      })
      return true
    },
    [appRun, console, jotaiStore, navigate]
  )
}
