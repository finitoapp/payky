import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"
import { BillId } from "@/core/modules/bill/bill-types.ts"
import { CheckoutPage } from "@/features/checkout/checkout-page.tsx"

const CheckoutSearchSchema = z.object({
  billId: BillId.optional(),
})

export const Route = createFileRoute("/_terminal/checkout")({
  component: CheckoutRoute,
  validateSearch: (search) => CheckoutSearchSchema.parse(search),
  staticData: {
    terminalLayout: {
      viewportClassName:
        "h-[calc(100svh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] px-5 py-6",
    },
  },
})

function CheckoutRoute() {
  const { billId } = Route.useSearch()

  return (
    <Suspense fallback={null}>
      <CheckoutPage billId={billId} />
    </Suspense>
  )
}
