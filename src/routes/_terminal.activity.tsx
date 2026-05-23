import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { PaymentHistory } from "@/components/payment-history.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/activity")({
  component: ActivityPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-6 py-6",
    },
  },
})

function ActivityPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("activity.title")} />

      <section className="flex flex-col gap-8">
        <Suspense fallback={null}>
          <PaymentHistory />
        </Suspense>
      </section>
    </>
  )
}
