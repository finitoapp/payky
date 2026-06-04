import { createFileRoute } from "@tanstack/react-router"
import { Languages } from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import {
  useTranslation,
  useTranslationForLanguage,
} from "@/hooks/use-translation.ts"
import type { Language, TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/language")({
  component: LanguagePage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

interface LanguageOption {
  readonly value: Language
  readonly label: TranslationKey
  readonly description: TranslationKey
}

const languageOptions: ReadonlyArray<LanguageOption> = [
  {
    value: "en",
    label: "settings.language.english.title",
    description: "settings.language.english.description",
  },
  {
    value: "cs",
    label: "settings.language.czech.title",
    description: "settings.language.czech.description",
  },
]

function LanguagePage() {
  const { language, t } = useTranslation()
  const setLanguage = useTranslationForLanguage()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.language.title")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language.mode.title")}</CardTitle>
          <CardDescription>
            {t("settings.language.mode.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[language]}
            onValueChange={(nextValue) => {
              const [nextLanguage] = nextValue
              if (nextLanguage) {
                setLanguage(nextLanguage as Language)
              }
            }}
            spacing={2}
            className="grid w-full grid-cols-1"
            orientation="vertical"
            variant="outline"
          >
            {languageOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="flex justify-start px-6 py-4 gap-6 text-left h-auto"
              >
                <Languages className="text-muted-foreground" />
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{t(option.label)}</span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t(option.description)}
                  </span>
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>
    </>
  )
}
