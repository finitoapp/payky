import type { Language } from "@payky/app-shared/i18n/resources"
import Languages from "lucide-react-native/icons/languages"
import { XStack } from "tamagui"
import { languageOptions } from "../../components/language-options.ts"
import { Icon } from "../../components/ui/icon.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx"
import { useSetLanguage, useTranslation } from "../../hooks/use-translation.ts"

export function LanguageSelect({ disabled }: { readonly disabled?: boolean }) {
  const { language, t } = useTranslation()
  const setLanguage = useSetLanguage()

  return (
    <XStack flex={1} justify="flex-end">
      <Select<Language>
        value={language}
        disabled={disabled}
        onValueChange={(nextLanguage) => {
          setLanguage(nextLanguage)
        }}
      >
        <SelectTrigger
          accessibilityLabel={t("onboarding.language.title")}
          size="sm"
        >
          <Icon icon={Languages} size={14} color="muted-foreground" />
          <SelectValue>
            {languageOptions.find((option) => option.value === language)
              ?.label ?? language}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {languageOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </XStack>
  )
}
