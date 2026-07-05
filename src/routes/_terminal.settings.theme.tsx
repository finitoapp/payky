import { createFileRoute } from "@tanstack/react-router"
import { Laptop, Moon, Sun } from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { type Theme, useTheme } from "@/components/theme-provider.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { OptionToggleGroup } from "@/features/settings/option-toggle-group.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/theme")({
  component: ThemePage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

interface ThemeOption {
  readonly value: Theme
  readonly label: TranslationKey
  readonly description: TranslationKey
  readonly icon: typeof Sun
}

const themeOptions: ReadonlyArray<ThemeOption> = [
  {
    value: "light",
    label: "settings.theme.light.title",
    description: "settings.theme.light.description",
    icon: Sun,
  },
  {
    value: "dark",
    label: "settings.theme.dark.title",
    description: "settings.theme.dark.description",
    icon: Moon,
  },
  {
    value: "system",
    label: "settings.theme.system.title",
    description: "settings.theme.system.description",
    icon: Laptop,
  },
]

function ThemePage() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <>
      <div className="h-6" />
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
            options={themeOptions.map((option) => ({
              value: option.value,
              icon: option.icon,
              title: t(option.label),
              description: t(option.description),
            }))}
            onChange={setTheme}
          />
        </CardContent>
      </Card>
    </>
  )
}
