import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"
import { BillId } from "@/core/modules/bill/bill-types.ts"
import { TableId } from "@/core/modules/table/table-types.ts"
import { BillPage } from "@/features/bill/bill-page.tsx"

const BillSearchSchema = z.object({
  billId: BillId.optional(),
  tableId: TableId.optional(),
})

export const Route = createFileRoute("/_terminal/bill")({
  component: BillRoute,
  validateSearch: (search) => BillSearchSchema.parse(search),
  staticData: {
    terminalLayout: {
      viewportClassName:
        "h-[calc(100svh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] px-5 py-6",
    },
  },
})

function BillRoute() {
  const { billId, tableId } = Route.useSearch()

  return (
    <Suspense fallback={null}>
      <BillPage billId={billId} initialTableId={tableId} />
    </Suspense>
  )
}
