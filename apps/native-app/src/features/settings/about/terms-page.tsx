import { Text, YStack } from "tamagui"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"

export function TermsPage() {
  const { t } = useTranslation()

  return (
    <Screen>
      <ScreenHeader title={t("settings.about.terms.title")} />
      <YStack
        gap="2"
        p="4"
        rounded="lg"
        borderWidth={1}
        borderColor="border-color"
      >
        <Text fontSize={18} fontWeight="700">
          {t("settings.about.terms.heading")}
        </Text>
        <Text color="muted-foreground">
          {t("settings.about.terms.summary")}
        </Text>
        <Text color="muted-foreground" lineHeight={22}>
          {t("settings.about.terms.body")}
        </Text>
      </YStack>
    </Screen>
  )
}
