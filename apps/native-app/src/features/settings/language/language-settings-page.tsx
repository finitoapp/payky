import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { DeviceLocale } from "@payky/core/evolu/device-client"
import { Text, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { languageOptions } from "../../../components/language-options.ts"
import { OptionToggleGroup } from "../../../components/option-toggle-group.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  useLocale,
  useSetLanguage,
  useSetLocale,
  useTranslation,
} from "../../../hooks/use-translation.ts"

const localeOptions = [
  { value: "en-US", label: "settings.language.locale.english.title" },
  { value: "cs-CZ", label: "settings.language.locale.czech.title" },
  { value: "sk-SK", label: "settings.language.locale.slovak.title" },
] as const satisfies ReadonlyArray<{
  readonly value: DeviceLocale
  readonly label: TranslationKey
}>

/**
 * App language and regional format, as web's `LanguageSettingsPage`. A choice
 * is written at once; every screen reads the device setting, so the UI follows
 * without a reload.
 */
export function LanguageSettingsPage() {
  const { language, t } = useTranslation()
  const locale = useLocale()
  const setLanguage = useSetLanguage()
  const setLocale = useSetLocale()

  return (
    <Screen>
      <FadeHeader title={t("settings.language.title")} />
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.language.mode.title")}</Text>
        <Text color="muted-foreground">
          {t("settings.language.mode.description")}
        </Text>
        <OptionToggleGroup
          value={language}
          options={languageOptions.map(({ value, label }) => ({
            value,
            title: label,
          }))}
          onChange={setLanguage}
        />
      </YStack>
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.language.locale.title")}</Text>
        <Text color="muted-foreground">
          {t("settings.language.locale.description")}
        </Text>
        <OptionToggleGroup
          value={locale}
          options={localeOptions.map(({ value, label }) => ({
            value,
            title: t(label),
          }))}
          onChange={setLocale}
        />
      </YStack>
    </Screen>
  )
}
