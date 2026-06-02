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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import type { TranslationKey } from "@/i18n/resources.ts"
import { useTranslation } from "@/i18n/use-translation.ts"

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
          <ToggleGroup
            value={[theme]}
            onValueChange={(nextValue) => {
              const [nextTheme] = nextValue
              if (nextTheme) {
                setTheme(nextTheme as Theme)
              }
            }}
            spacing={2}
            className="grid w-full grid-cols-1"
            orientation="vertical"
            variant="outline"
          >
            {themeOptions.map((option) => {
              const Icon = option.icon

              return (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className="flex justify-start px-6 py-4 gap-6 text-left h-auto"
                >
                  <Icon className="text-muted-foreground" />
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{t(option.label)}</span>
                    <span className="text-xs leading-snug text-muted-foreground">
                      {t(option.description)}
                    </span>
                  </span>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </CardContent>
      </Card>
    </>
  )
}
