import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"
import { TableId } from "@/core/modules/table/table-types.ts"
import { OpenBillsPage } from "@/features/checkout/open-bills-page.tsx"

const OpenBillsSearchSchema = z.object({
  tableId: TableId.optional(),
})

export const Route = createFileRoute("/_terminal/checkout_/bills")({
  component: OpenBillsRoute,
  validateSearch: (search) => OpenBillsSearchSchema.parse(search),
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function OpenBillsRoute() {
  const { tableId } = Route.useSearch()

  return (
    <Suspense fallback={null}>
      <OpenBillsPage initialTableId={tableId} />
    </Suspense>
  )
}
