import { Text, XStack } from "tamagui"
import { languageOptions } from "../../components/language-options.ts"
import { useSetLanguage, useTranslation } from "../../hooks/use-translation.ts"

export function LanguageSelect({ disabled }: { readonly disabled?: boolean }) {
  const { language, t } = useTranslation()
  const setLanguage = useSetLanguage()

  return (
    <XStack
      gap="2"
      justify="flex-end"
      accessibilityLabel={t("onboarding.language.title")}
    >
      {languageOptions.map((option) => {
        const selected = option.value === language
        return (
          <Text
            key={option.value}
            px="3"
            py="2"
            minH={44}
            rounded="lg"
            borderWidth={1}
            borderColor={selected ? "primary" : "border-color"}
            fontWeight={selected ? "700" : "400"}
            opacity={disabled ? 0.6 : 1}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: disabled === true }}
            onPress={() => {
              if (!disabled && !selected) setLanguage(option.value)
            }}
          >
            {option.label}
          </Text>
        )
      })}
    </XStack>
  )
}
