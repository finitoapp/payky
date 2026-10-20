import { QueryClientProvider } from "@tanstack/react-query"
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
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
import { EvoluStartupError } from "../src/components/app/evolu-startup-error.tsx"
import { PinPromptHost } from "../src/components/app/pin-prompt-host.tsx"
import { SentryController } from "../src/components/app/sentry-controller.tsx"
import { SwitchioRestoredResult } from "../src/components/app/switchio-restored-result.tsx"
import { ToastHost } from "../src/components/app/toast-host.tsx"
import {
  routeFallbackMounted,
  routeFallbackUnmounted,
  useIdleAfterFirstScreen,
} from "../src/core/first-screen.ts"
import { queryClient } from "../src/core/query-client.ts"
import { resolveTheme } from "../src/core/theme-preference.ts"
import { removeStaleExportFolders } from "../src/features/settings/evolu-export/evolu-export-io.ts"
import { useThemePreference } from "../src/hooks/use-theme-preference.ts"
import { tamaguiConfig } from "../tamagui.config.ts"

// Kept until the first screen is ready (src/core/first-screen.ts) instead
// of Expo Router hiding it as soon as this layout renders, so the start
// shows the splash's logo throughout rather than loaders in turn.
void SplashScreen.preventAutoHideAsync()
// Android fades it out with an accelerating curve, by default over 400 ms:
// most of the fade comes at the end, so the ready screen sat behind a
// lingering logo. 150 ms still reads as a fade.
SplashScreen.setOptions({ duration: 150 })

/**
 * Expo Router's fallback for a route that suspends, empty on the navigator's
 * background as its default is. It also tells `first-screen.ts` a route is
 * still on its way, so the splash waits for it.
 */
export function SuspenseFallback() {
  useEffect(() => {
    routeFallbackMounted()
    return routeFallbackUnmounted
  }, [])
  return null
}

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
  // Once per process: clear Evolu export files an earlier run left in the cache.
  useEffect(() => {
    try {
      removeStaleExportFolders()
    } catch {
      // Best effort; the next export clears them too.
    }
  }, [])

  return (
    <Provider store={store}>
      <EvoluStartupError />
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
  // App jobs first, the Cashu one after, each once the screen is left alone.
  const appJobsMayStart = useIdleAfterFirstScreen(1500)
  const cashuJobsMayStart = useIdleAfterFirstScreen(3000)

  return (
    <QueryClientProvider client={queryClient}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
        <Theme name={theme}>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          <AccessGate>
            <ThemedStack dark={theme === "dark"} />
          </AccessGate>
          {/* After the first screen and a pause in tapping: their start blocks the JS thread. */}
          {appJobsMayStart ? <AppEvoluConsumers /> : null}
          {cashuJobsMayStart ? <CashuEvoluConsumers /> : null}
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
