import InterBold from "@tamagui/font-inter/otf/Inter-Bold.otf"
import InterMedium from "@tamagui/font-inter/otf/Inter-Medium.otf"
import Inter from "@tamagui/font-inter/otf/Inter-Regular.otf"
import InterSemiBold from "@tamagui/font-inter/otf/Inter-SemiBold.otf"
import { QueryClientProvider } from "@tanstack/react-query"
import { useFonts } from "expo-font"
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { createStore, Provider } from "jotai"
import { Suspense, useEffect, useState } from "react"
import { useColorScheme } from "react-native"
import { TamaguiProvider, Theme, useTheme } from "tamagui"
import { AccessGate } from "../src/components/app/access-gate.tsx"
import {
  AppEvoluConsumers,
  CashuEvoluConsumers,
} from "../src/components/app/app-background-jobs.tsx"
import { AppErrorScreen } from "../src/components/app/app-error-screen.tsx"
import { AppLoader } from "../src/components/app/app-loader.tsx"
import { ConfirmHost } from "../src/components/app/confirm-host.tsx"
import { DemoDataSeed } from "../src/components/app/demo-data-seed.tsx"
import { DeviceRegistration } from "../src/components/app/device-registration.tsx"
import { PinPromptHost } from "../src/components/app/pin-prompt-host.tsx"
import { SentryController } from "../src/components/app/sentry-controller.tsx"
import { SwitchioRestoredResult } from "../src/components/app/switchio-restored-result.tsx"
import { ToastHost } from "../src/components/app/toast-host.tsx"
import { queryClient } from "../src/core/query-client.ts"
import { resolveTheme } from "../src/core/theme-preference.ts"
import { removeStaleExportFolders } from "../src/features/settings/evolu-export/evolu-export-io.ts"
import { useThemePreference } from "../src/hooks/use-theme-preference.ts"
import { tamaguiConfig } from "../tamagui.config.ts"

/**
 * Expo Router's root error boundary. `retry` remounts this layout, whose
 * fresh jotai store recreates the app Evolu client, which is what web's
 * "try again" does with `reloadAppEvoluAtom`; a device-database failure
 * would fail again, as on web.
 */
export function ErrorBoundary({
  error,
  retry,
}: {
  readonly error: Error
  readonly retry: () => void
}) {
  return <AppErrorScreen error={error} retry={retry} />
}

export default function RootLayout() {
  const [store] = useState(createStore)
  const [fontsLoaded, fontError] = useFonts({
    Inter,
    InterMedium,
    InterSemiBold,
    InterBold,
  })
  // Once per process: clear Evolu export files an earlier run left in the cache.
  useEffect(() => {
    try {
      removeStaleExportFolders()
    } catch {
      // Best effort; the next export clears them too.
    }
  }, [])
  if (fontError) throw fontError
  if (!fontsLoaded) return <AppLoader />

  return (
    <Provider store={store}>
      <Suspense fallback={<AppLoader />}>
        <ThemedApp />
      </Suspense>
    </Provider>
  )
}

/**
 * Everything under the Tamagui theme, which follows the device theme
 * preference (settings): `system` the OS scheme, light/dark forced. The
 * preference lives in the device database, so this suspends until it is
 * open; `AppLoader` covers that wait on the system scheme's background.
 */
function ThemedApp() {
  const preference = useThemePreference()
  const systemScheme = useColorScheme()
  const theme = resolveTheme(preference, systemScheme)

  return (
    <QueryClientProvider client={queryClient}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
        <Theme name={theme}>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          <AccessGate>
            <ThemedStack dark={theme === "dark"} />
          </AccessGate>
          <AppEvoluConsumers />
          <CashuEvoluConsumers />
          <ConfirmHost />
          <PinPromptHost />
          <ToastHost />
          <Suspense fallback={null}>
            <SentryController />
            <DeviceRegistration />
            <DemoDataSeed />
            <SwitchioRestoredResult />
          </Suspense>
        </Theme>
      </TamaguiProvider>
    </QueryClientProvider>
  )
}

/**
 * The navigator on the app's theme. React Navigation draws screens and their
 * transitions on its own theme's background, light grey by default, so a
 * route that suspends on its first open (rendering nothing until its data is
 * there) showed that grey meanwhile: a white flash, most visible in dark.
 */
function ThemedStack({ dark }: { readonly dark: boolean }) {
  const theme = useTheme()
  const base = dark ? DarkTheme : DefaultTheme
  const background = theme.background.val
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, background, card: background },
      }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  )
}
