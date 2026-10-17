import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { ReceiptIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Shown in place of a payment or bill detail when the route's id doesn't
 * parse or matches no row.
 */
export function NotFoundCard({
  messageKey,
}: {
  readonly messageKey: TranslationKey
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <ReceiptIcon className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t(messageKey)}</p>
      </CardContent>
    </Card>
  )
}
