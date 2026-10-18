import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { ConsentCard } from "./consent-card.tsx"
import { usePrivacySettings } from "./use-privacy-settings.ts"

/** The device's consents, as web's `PrivacySettingsPage`: they come first. */
export function PrivacySettingsPage() {
  const { t } = useTranslation()
  const settings = usePrivacySettings()
  const reporting = settings.errorReportingEnabled

  return (
    <Screen>
      <ScreenHeader title={t("settings.about.privacy.title")} />
      <ConsentCard
        title={t("settings.privacy.errorReporting.title")}
        description={t("settings.privacy.errorReporting.description")}
        status={t(
          reporting
            ? "settings.privacy.errorReporting.enabled"
            : "settings.privacy.errorReporting.disabled"
        )}
        actionLabel={t(
          reporting
            ? "settings.privacy.errorReporting.disable"
            : "settings.privacy.errorReporting.enable"
        )}
        onPress={() => settings.setErrorReportingEnabled(!reporting)}
      />
    </Screen>
  )
}
