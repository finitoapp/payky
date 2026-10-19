import { Linking } from "react-native"
import { Text, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"

const SOFTPOS_URL = "https://switchio.com/try-softpos/"

/**
 * Informational only, as web's: the terminal itself is configured in the
 * Switchio SoftPOS app, which this app drives through the `switchio.pay.ECR`
 * intent.
 */
export function CardSwitchioSettingsPage() {
  const { t } = useTranslation()

  return (
    <Screen>
      <FadeHeader title={t("settings.paymentAccounts.method.cardSwitchio")} />
      <YStack gap="3">
        <Text fontWeight="600">
          {t("settings.cardSwitchioAccount.info.title")}
        </Text>
        <Text color="muted-foreground">
          {t("settings.cardSwitchioAccount.info.description")}
        </Text>
        <Text>{`• ${t("settings.cardSwitchioAccount.info.softpos")}`}</Text>
        <Text>{`• ${t("settings.cardSwitchioAccount.info.contract")}`}</Text>
        <Button
          size="lg"
          variant="outline"
          label={t("settings.cardSwitchioAccount.info.softposLink")}
          onPress={() => void Linking.openURL(SOFTPOS_URL)}
        />
      </YStack>
    </Screen>
  )
}
