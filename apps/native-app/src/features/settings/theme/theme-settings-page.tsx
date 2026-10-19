import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { DeviceTheme } from "@payky/core/evolu/device-client"
import Laptop from "lucide-react-native/icons/laptop"
import Moon from "lucide-react-native/icons/moon"
import Sun from "lucide-react-native/icons/sun"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { OptionToggleGroup } from "../../../components/option-toggle-group.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
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

const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Laptop,
} satisfies Record<DeviceTheme, typeof Sun>

/** Light, dark or the system's, as web's `ThemeSettingsPage`; applied at once by the root layout. */
export function ThemeSettingsPage() {
  const { t } = useTranslation()
  const theme = useThemePreference()
  const setTheme = useSetThemePreference()

  return (
    <Screen>
      <FadeHeader title={t("settings.theme.title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.theme.mode.title")}</CardTitle>
          <CardDescription>
            {t("settings.theme.mode.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OptionToggleGroup
            value={theme}
            options={themes.map((value) => ({
              value,
              icon: themeIcons[value],
              title: t(themeLabelKeys[value]),
              description: t(themeDescriptionKeys[value]),
            }))}
            onChange={setTheme}
          />
        </CardContent>
      </Card>
    </Screen>
  )
}
