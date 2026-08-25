import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { OpenBillsPage } from "@/features/checkout/open-bills-page.tsx"

export const Route = createFileRoute("/_terminal/checkout_/bills")({
  component: OpenBillsRoute,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function OpenBillsRoute() {
  return (
    <Suspense fallback={null}>
      <OpenBillsPage />
    </Suspense>
  )
}
