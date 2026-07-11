import { Power, PowerOff } from "lucide-react"

import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  useErrorReportingEnabled,
  useSetErrorReportingEnabled,
} from "@/hooks/use-error-reporting.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function ErrorReportingCard() {
  const { t } = useTranslation()
  const enabled = useErrorReportingEnabled()
  const setEnabled = useSetErrorReportingEnabled()
  const Icon = enabled ? PowerOff : Power

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.privacy.errorReporting.title")}</CardTitle>
        <CardDescription>
          {t("settings.privacy.errorReporting.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <Badge variant={enabled ? "secondary" : "outline"}>
          {enabled
            ? t("settings.privacy.errorReporting.enabled")
            : t("settings.privacy.errorReporting.disabled")}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setEnabled(!enabled)
          }}
        >
          <Icon data-icon="inline-start" />
          {enabled
            ? t("settings.privacy.errorReporting.disable")
            : t("settings.privacy.errorReporting.enable")}
        </Button>
      </CardContent>
    </Card>
  )
}
