import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"
import {
  FiatCurrencySchema,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { PaymentTipPage } from "@/features/payment-tip/payment-tip-page.tsx"

const PaymentTipSearchSchema = z.object({
  amount: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: FiatCurrencySchema,
})

export const Route = createFileRoute("/_terminal/payment/tip")({
  component: PaymentTipRoute,
  validateSearch: (search) => PaymentTipSearchSchema.parse(search),
  staticData: {
    terminalLayout: {
      viewportClassName:
        "h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] px-7 py-6",
    },
  },
})

function PaymentTipRoute() {
  const { amount, currency } = Route.useSearch()

  return (
    <Suspense fallback={null}>
      <PaymentTipPage amount={NonNegativeInteger(amount)} currency={currency} />
    </Suspense>
  )
}
