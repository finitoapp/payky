import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { DeviceTheme } from "@payky/core/evolu/device-client"
import { Text, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { OptionSelect } from "../../../components/option-select.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  useSetThemePreference,
  useThemePreference,
} from "../../../hooks/use-theme-preference.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

export const themeLabelKeys = {
  light: "settings.theme.light.title",
  dark: "settings.theme.dark.title",
  system: "settings.theme.system.title",
} satisfies Record<DeviceTheme, TranslationKey>

const themeDescriptionKeys = {
  light: "settings.theme.light.description",
  dark: "settings.theme.dark.description",
  system: "settings.theme.system.description",
} satisfies Record<DeviceTheme, TranslationKey>

const themes: ReadonlyArray<DeviceTheme> = ["light", "dark", "system"]

/** Light, dark or the system's, as web's `ThemeSettingsPage`; applied at once by the root layout. */
export function ThemeSettingsPage() {
  const { t } = useTranslation()
  const theme = useThemePreference()
  const setTheme = useSetThemePreference()

  return (
    <Screen>
      <FadeHeader title={t("settings.theme.title")} />
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.theme.mode.title")}</Text>
        <Text color="muted-foreground">
          {t("settings.theme.mode.description")}
        </Text>
        <OptionSelect
          value={theme}
          options={themes.map((value) => ({
            value,
            title: t(themeLabelKeys[value]),
            description: t(themeDescriptionKeys[value]),
          }))}
          onChange={setTheme}
        />
      </YStack>
    </Screen>
  )
}
