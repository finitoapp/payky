import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"
import { BillId, createRandomBillId } from "@/core/modules/bill/bill-types.ts"
import { TableId } from "@/core/modules/table/table-types.ts"
import { BillPage } from "@/features/bill/bill-page.tsx"

const BillSearchSchema = z.object({
  billId: BillId.optional(),
  tableId: TableId.optional(),
})

export const Route = createFileRoute("/_terminal/bill")({
  component: BillRoute,
  validateSearch: (search) => BillSearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    // A direct navigation to `/bill` with no `billId` search param at all —
    // every in-app link already includes one (see `pos-overview-page.tsx`'s
    // `NewBillLink`). Redirect here, before the route ever renders, instead
    // of generating an id inside `BillPage` itself: that component can
    // suspend on its very first render (loading the new bill's query), and
    // React retries a suspended initial render from scratch, so a
    // lazily-`useState`-generated id would be regenerated on every retry —
    // an infinite loop that never lets the page commit, leaving the
    // Suspense fallback shown forever.
    if (search.billId === undefined) {
      throw redirect({
        to: "/bill",
        search: { billId: createRandomBillId(), tableId: search.tableId },
        replace: true,
      })
    }
  },
  staticData: {
    terminalLayout: {
      viewportClassName:
        "h-[calc(100svh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] px-3 py-6",
    },
  },
})

function BillRoute() {
  const { billId, tableId } = Route.useSearch()

  // Unreachable in practice: `beforeLoad` above always redirects to a URL
  // with `billId` set before this ever renders. Only here to satisfy the
  // type of `BillPage`'s required `billId` prop.
  if (billId === undefined) return null

  return (
    <Suspense fallback={null}>
      <BillPage billId={billId} initialTableId={tableId} />
    </Suspense>
  )
}
