import { Languages } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { languageOptions } from "@/features/shared/language-options.ts"
import { useSetLanguage, useTranslation } from "@/hooks/use-translation.ts"
import type { Language } from "@/i18n/resources.ts"

/**
 * Looks like the landing page's picker but cannot share code with it: the
 * landing page renders outside the device-settings context and translates
 * straight from `resources`, so it reaches neither `useTranslation` nor
 * `useSetLanguage`. Language names stay in their own language, which is why
 * the labels come from `languageOptions` untranslated.
 */
export function LanguageSelect({ disabled }: { readonly disabled?: boolean }) {
  const { language, t } = useTranslation()
  const setLanguage = useSetLanguage()

  return (
    <Select<Language>
      value={language}
      disabled={disabled}
      onValueChange={(nextLanguage: Language | null) => {
        if (nextLanguage !== null) {
          setLanguage(nextLanguage)
        }
      }}
    >
      <SelectTrigger
        aria-label={t("onboarding.language.title")}
        size="sm"
        className="gap-1 border-none bg-transparent px-2 text-muted-foreground/60 text-xs shadow-none hover:bg-transparent hover:text-muted-foreground data-[popup-open]:text-muted-foreground [&_svg]:text-current"
      >
        <Languages aria-hidden="true" className="size-3.5" />
        <SelectValue>
          {(value: Language) =>
            languageOptions.find((option) => option.value === value)?.label ??
            value
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {languageOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
