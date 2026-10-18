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
  const lookup = settings.productLookupEnabled

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
      <ConsentCard
        title={t("settings.privacy.productLookup.title")}
        description={t("settings.privacy.productLookup.description")}
        status={t(
          lookup
            ? "settings.privacy.productLookup.enabled"
            : "settings.privacy.productLookup.disabled"
        )}
        actionLabel={t(
          lookup
            ? "settings.privacy.productLookup.disable"
            : "settings.privacy.productLookup.enable"
        )}
        onPress={() => settings.setProductLookupEnabled(!lookup)}
      />
    </Screen>
  )
}
