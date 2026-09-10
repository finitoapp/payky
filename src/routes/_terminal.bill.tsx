import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"
import { RouteMessage } from "@/components/route-message.tsx"
import { BillId, createRandomBillId } from "@/core/modules/bill/bill-types.ts"
import { TableId } from "@/core/modules/table/table-types.ts"
import { BillPage } from "@/features/bill/bill-page.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

// `billId` is parsed in the component, not here: a `validateSearch` throw
// on a hand-typed or stale link escapes to the global error boundary, and a
// bad id deserves the same "invalid id" page a bad /payment/<id> gets. A
// broken `tableId` is only a lost table preselection, so it just falls back
// to none.
const BillSearchSchema = z.object({
  billId: z.string().optional(),
  tableId: TableId.optional().catch(undefined),
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
  const { t } = useTranslation()
  const { billId, tableId } = Route.useSearch()
  // A well-formed id that has no bill row yet is *not* an error: that is
  // exactly how a new cart starts (see `beforeLoad`). Only an unparseable
  // one is.
  const parsedBillId = BillId.safeParse(billId)

  if (!parsedBillId.success) {
    return <RouteMessage>{t("bill.invalidId")}</RouteMessage>
  }

  return (
    <Suspense fallback={null}>
      <BillPage billId={parsedBillId.data} initialTableId={tableId} />
    </Suspense>
  )
}
