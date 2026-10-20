import { router } from "expo-router"
import { Text, YStack } from "tamagui"
import { Screen } from "../../components/screen.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import { AccountTransferTarget } from "../shared/account-transfer-target.tsx"

/** `/pair`: adds an account from another device to this one (account/0001). */
export function PairTargetPage() {
  const { t } = useTranslation()
  return (
    <Screen>
      <YStack gap="2">
        <Text
          fontSize="2xl"
          lineHeight="2xl"
          fontWeight="700"
          accessibilityRole="header"
        >
          {t("accountTransfer.target.title")}
        </Text>
        <Text color="muted-foreground">
          {t("accountTransfer.target.description")}
        </Text>
      </YStack>
      <AccountTransferTarget
        source="settings"
        confirmBeforeAdding
        // Back to the accounts screen, which opens its own restore form.
        onRestoreWithPhrase={() =>
          router.dismissTo({
            pathname: "/settings/accounts",
            params: { restore: "1" },
          })
        }
      />
    </Screen>
  )
}
