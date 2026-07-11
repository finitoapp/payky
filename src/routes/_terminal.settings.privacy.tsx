import { createFileRoute } from "@tanstack/react-router"

import { FadeHeader } from "@/components/fade-header.tsx"
import { ErrorReportingCard } from "@/features/settings/privacy/error-reporting-card.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/privacy")({
  component: PrivacySettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function PrivacySettingsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.privacy.title")} />
      <ErrorReportingCard />
    </>
  )
}
