import { createFileRoute } from "@tanstack/react-router"

import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { ErrorReportingCard } from "@/features/settings/privacy/error-reporting-card.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/about/privacy")({
  component: PrivacyPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.about.privacy.title")} />

      <div className="flex flex-col gap-5">
        {/* The consent comes first; the policy below explains what it sends. */}
        <ErrorReportingCard />
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.about.privacy.heading")}</CardTitle>
            <CardDescription>
              {t("settings.about.privacy.summary")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {t("settings.about.privacy.body")}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
