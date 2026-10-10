import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { BillDetail } from "@/features/activity/bill-detail.tsx"
import { PaymentDetailSkeleton } from "@/features/activity/payment-detail.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/activity_/bills_/$billId")({
  component: BillDetailPage,
  staticData: {
    access: "activity",
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function BillDetailPage() {
  const { t } = useTranslation()
  const { billId } = Route.useParams()

  return (
    <>
      <FadeHeader title={t("billDetail.title")} />

      <section className="pt-16">
        <Suspense fallback={<PaymentDetailSkeleton />}>
          <BillDetail billId={billId} />
        </Suspense>
      </section>
    </>
  )
}
