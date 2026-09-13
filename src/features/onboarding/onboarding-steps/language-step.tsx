import { Languages } from "lucide-react"
import { OptionToggleGroup } from "@/components/option-toggle-group.tsx"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { languageOptions } from "@/features/shared/language-options.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { Language } from "@/i18n/resources.ts"

export function LanguageStep({
  language,
  pending,
  onSelect,
}: {
  readonly language: Language
  readonly pending: boolean
  readonly onSelect: (language: Language) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.language.title")}</CardTitle>
        <CardDescription>
          {t("onboarding.language.description")}
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
          disabled={pending}
          onChange={onSelect}
        />
      </CardContent>
    </>
  )
}
