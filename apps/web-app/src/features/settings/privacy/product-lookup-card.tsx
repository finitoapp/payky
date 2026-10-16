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
  useProductLookupEnabled,
  useSetProductLookupEnabled,
} from "@/hooks/use-product-lookup.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function ProductLookupCard() {
  const { t } = useTranslation()
  const enabled = useProductLookupEnabled()
  const setEnabled = useSetProductLookupEnabled()
  const Icon = enabled ? PowerOff : Power

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.privacy.productLookup.title")}</CardTitle>
        <CardDescription>
          {t("settings.privacy.productLookup.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <Badge variant={enabled ? "secondary" : "outline"}>
          {enabled
            ? t("settings.privacy.productLookup.enabled")
            : t("settings.privacy.productLookup.disabled")}
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
            ? t("settings.privacy.productLookup.disable")
            : t("settings.privacy.productLookup.enable")}
        </Button>
      </CardContent>
    </Card>
  )
}
