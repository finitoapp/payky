import Constants from "expo-constants"
import { Platform } from "react-native"
import { Text, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { SettingsRow } from "../settings-row.tsx"

export function AboutPage() {
  const { t } = useTranslation()
  const version = Constants.expoConfig?.version
  const versionCode = Constants.expoConfig?.android?.versionCode

  return (
    <Screen>
      <FadeHeader title={t("settings.about.title")} />
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
      <SettingsRow
        title={t("settings.about.privacy.title")}
        value={t("settings.about.privacy.description")}
        href="/settings/about/privacy"
      />
      <SettingsRow
        title={t("settings.about.terms.title")}
        value={t("settings.about.terms.description")}
        href="/settings/about/terms"
      />
      <SettingsRow
        title={t("settings.evoluExport.title")}
        value={t("settings.evoluExport.description")}
        href="/settings/evolu-export"
      />
      <SettingsRow
        title={t("settings.demoData.title")}
        value={t("settings.demoData.description")}
        href="/settings/demo-data"
      />
      <SettingsRow
        title={t("settings.debugConsole.title")}
        value={t("settings.debugConsole.description")}
        href="/settings/debug-console"
      />
    </Screen>
  )
}
