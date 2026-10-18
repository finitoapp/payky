import Constants from "expo-constants"
import { Platform } from "react-native"
import { Text, YStack } from "tamagui"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"

export function AboutPage() {
  const { t } = useTranslation()
  const version = Constants.expoConfig?.version
  const versionCode = Constants.expoConfig?.android?.versionCode

  return (
    <Screen>
      <ScreenHeader title={t("settings.about.title")} />
      <YStack items="center" gap="3" py="8">
        <Text fontSize={24} fontWeight="700">
          {t("settings.about.app.title")}
        </Text>
        {version === undefined ? null : (
          <Text color="muted-foreground">
            {t("settings.appVersion")} <Text fontWeight="700">{version}</Text>
          </Text>
        )}
        {Platform.OS === "android" && versionCode !== undefined ? (
          <Text color="muted-foreground">
            {t("settings.appVersionCode")}{" "}
            <Text fontWeight="700">{versionCode}</Text>
          </Text>
        ) : null}
      </YStack>
    </Screen>
  )
}
