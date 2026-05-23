import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { PaymentDetail } from "@/components/payment-detail.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/activity_/$paymentId")({
  component: PaymentDetailPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-6 py-6",
    },
  },
})

function PaymentDetailPage() {
  const { t } = useTranslation()
  const { paymentId } = Route.useParams()

  return (
    <>
      <FadeHeader title={t("paymentDetail.title")} />

      <section className="pt-16">
        <Suspense fallback={null}>
          <PaymentDetail paymentId={paymentId} />
        </Suspense>
      </section>
    </>
  )
}
