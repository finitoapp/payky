import {
  resources,
  type TranslationKey,
} from "@payky/app-shared/i18n/resources"
import { getPreferredDeviceLanguage } from "@payky/core/modules/device/device-utils"
import Constants from "expo-constants"
import { useEffect } from "react"
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
} from "react-native"
import { captureReportedError } from "../../core/error-reporting.ts"
import { markFirstScreenReady } from "../../core/first-screen.ts"

/**
 * Plain React Native on purpose: Expo Router renders the root layout's
 * `ErrorBoundary` outside that layout, so there is no jotai store, Tamagui
 * theme or device Evolu to read here (and the crash may come from them). The
 * language is a best-effort lookup that degrades to English, as on web.
 */
function t(key: TranslationKey): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale
    return resources[getPreferredDeviceLanguage(locale)][key]
  } catch {
    return resources.en[key]
  }
}

export function AppErrorScreen({
  error,
  retry,
}: {
  readonly error: unknown
  readonly retry: () => void
}) {
  const dark = useColorScheme() === "dark"
  const fg = dark ? "#fafafa" : "#0a0a0a"

  useEffect(() => {
    captureReportedError(error)
  }, [error])
  // A crash before the first screen would stay behind the held splash.
  useEffect(() => {
    markFirstScreenReady()
  }, [])

  const name = error instanceof Error ? error.name : t("appError.unknown")
  const message =
    error instanceof Error ? error.message : t("appError.nonError")

  return (
    <ScrollView
      style={{ backgroundColor: dark ? "#0a0a0a" : "#ffffff" }}
      contentContainerStyle={styles.content}
    >
      <Text role="heading" style={[styles.title, { color: fg }]}>
        {t("appError.title")}
      </Text>
      <Text style={{ color: fg }}>{t("appError.description")}</Text>
      <Text style={{ color: fg }}>
        {t("appError.name")}: {name}
      </Text>
      <Text style={{ color: fg }}>
        {t("appError.message")}: {message}
      </Text>
      <Text style={{ color: fg }}>
        {t("appError.version")}: {Constants.expoConfig?.version}
      </Text>
      <Pressable
        role="button"
        onPress={retry}
        style={[styles.button, { backgroundColor: fg }]}
      >
        <Text style={{ color: dark ? "#0a0a0a" : "#fafafa" }}>
          {t("appError.tryAgain")}
        </Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 22, fontWeight: "700" },
  button: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
})
