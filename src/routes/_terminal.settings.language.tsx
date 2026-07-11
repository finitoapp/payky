import { createFileRoute } from "@tanstack/react-router"
import { Globe2, Languages } from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import type { DeviceLocale } from "@/core/evolu/device-client.ts"
import { languageOptions } from "@/features/settings/language-options.ts"
import { OptionToggleGroup } from "@/features/settings/option-toggle-group.tsx"
import { useLocale, useSetLocale } from "@/hooks/use-locale.ts"
import {
  useTranslation,
  useTranslationForLanguage,
} from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/language")({
  component: LanguagePage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

interface LocaleOption {
  readonly value: DeviceLocale
  readonly label: TranslationKey
  readonly description: TranslationKey
}

const localeOptions: ReadonlyArray<LocaleOption> = [
  {
    value: "en-US",
    label: "settings.language.locale.english.title",
    description: "settings.language.locale.english.description",
  },
  {
    value: "cs-CZ",
    label: "settings.language.locale.czech.title",
    description: "settings.language.locale.czech.description",
  },
  {
    value: "sk-SK",
    label: "settings.language.locale.slovak.title",
    description: "settings.language.locale.slovak.description",
  },
]

function LanguagePage() {
  const locale = useLocale()
  const { language, t } = useTranslation()
  const setLanguage = useTranslationForLanguage()
  const setLocale = useSetLocale()

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
          <OptionToggleGroup
            value={language}
            options={languageOptions.map((option) => ({
              value: option.value,
              icon: Languages,
              title: option.label,
              description: t(option.description),
            }))}
            onChange={setLanguage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language.locale.title")}</CardTitle>
          <CardDescription>
            {t("settings.language.locale.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OptionToggleGroup
            value={locale}
            options={localeOptions.map((option) => ({
              value: option.value,
              icon: Globe2,
              title: t(option.label),
              description: t(option.description),
            }))}
            onChange={setLocale}
          />
        </CardContent>
      </Card>
    </>
  )
}
