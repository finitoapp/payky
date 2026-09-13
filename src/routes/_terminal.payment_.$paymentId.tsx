import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"

import { PaymentWaitPage } from "@/features/payment-wait/payment-wait-page.tsx"

export const Route = createFileRoute("/_terminal/payment_/$paymentId")({
  component: PaymentWaitRoute,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-7",
    },
  },
})

function PaymentWaitRoute() {
  const { paymentId } = Route.useParams()

  return (
    <Suspense fallback={null}>
      <PaymentWaitPage paymentId={paymentId} />
    </Suspense>
  )
}
