import { createFileRoute } from "@tanstack/react-router"

import { FadeHeader } from "@/components/fade-header.tsx"
import { EvoluExportPage } from "@/features/settings/evolu-export/evolu-export-page.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/evolu-export")({
  component: EvoluExportSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function EvoluExportSettingsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.evoluExport.title")} />
      <div className="mt-8">
        <EvoluExportPage />
      </div>
    </>
  )
}
