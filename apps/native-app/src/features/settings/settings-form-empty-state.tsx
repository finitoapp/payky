import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { Text } from "tamagui"
import { Screen } from "../../components/screen.tsx"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

/**
 * Shown by a settings edit screen when the route's id doesn't parse or
 * matches no row, as web's `SettingsFormEmptyState`.
 */
export function SettingsFormEmptyState({
  titleKey,
  messageKey,
}: {
  readonly titleKey: TranslationKey
  readonly messageKey: TranslationKey
}) {
  const { t } = useTranslation()
  return (
    <Screen>
      <ScreenHeader title={t(titleKey)} />
      <Text color="muted-foreground" text="center">
        {t(messageKey)}
      </Text>
    </Screen>
  )
}
