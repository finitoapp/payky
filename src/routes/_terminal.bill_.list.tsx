import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"
import { TableId } from "@/core/modules/table/table-types.ts"
import { BillListPage } from "@/features/bill/bill-list-page.tsx"

const BillListSearchSchema = z.object({
  tableId: TableId.optional(),
})

export const Route = createFileRoute("/_terminal/bill_/list")({
  component: BillListRoute,
  validateSearch: (search) => BillListSearchSchema.parse(search),
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function BillListRoute() {
  const { tableId } = Route.useSearch()

  return (
    <Suspense fallback={null}>
      <BillListPage initialTableId={tableId} />
    </Suspense>
  )
}
