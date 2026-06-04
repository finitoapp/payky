import { createFileRoute } from "@tanstack/react-router"

import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/about/terms")({
  component: TermsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function TermsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.about.terms.title")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.about.terms.heading")}</CardTitle>
          <CardDescription>{t("settings.about.terms.summary")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {t("settings.about.terms.body")}
          </p>
        </CardContent>
      </Card>
    </>
  )
}
