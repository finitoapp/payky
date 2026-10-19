import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import Receipt from "lucide-react-native/icons/receipt"
import { Text } from "tamagui"
import { useTranslation } from "../hooks/use-translation.ts"
import { fontSize } from "../theme/tokens.ts"
import { Card, CardContent } from "./ui/card.tsx"
import { Icon } from "./ui/icon.tsx"

/**
 * Web `apps/web-app/src/components/not-found-card.tsx`: shown in place of a
 * payment, bill or withdrawal detail when the route's id doesn't parse or
 * matches no row.
 *
 * Tailwind mirrored: `CardContent` `flex-col items-center gap-4 py-10
 * text-center`, a `size-10` muted `ReceiptIcon`, the text `text-sm
 * text-muted-foreground`.
 */
export function NotFoundCard({
  messageKey,
}: {
  readonly messageKey: TranslationKey
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardContent items="center" gap={16} py={40}>
        <Icon icon={Receipt} size={40} color="muted-foreground" />
        <Text
          fontSize={fontSize.sm}
          color="muted-foreground"
          text="center"
          accessibilityRole="alert"
        >
          {t(messageKey)}
        </Text>
      </CardContent>
    </Card>
  )
}
