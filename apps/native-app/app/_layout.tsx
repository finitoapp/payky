import InterBold from "@tamagui/font-inter/otf/Inter-Bold.otf"
import Inter from "@tamagui/font-inter/otf/Inter-Regular.otf"
import InterSemiBold from "@tamagui/font-inter/otf/Inter-SemiBold.otf"
import { useFonts } from "expo-font"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { createStore, Provider } from "jotai"
import { Suspense, useState } from "react"
import { ActivityIndicator, useColorScheme } from "react-native"
import { TamaguiProvider } from "tamagui"
import { AccessGate } from "../src/components/access-gate.tsx"
import { AppEvoluConsumers } from "../src/components/app-background-jobs.tsx"
import { AppErrorScreen } from "../src/components/app-error-screen.tsx"
import { ConfirmHost } from "../src/components/confirm-host.tsx"
import { DeviceRegistration } from "../src/components/device-registration.tsx"
import { PinPromptHost } from "../src/components/pin-prompt-host.tsx"
import { SentryController } from "../src/components/sentry-controller.tsx"
import { ToastHost } from "../src/components/toast-host.tsx"
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
  const theme = useColorScheme() === "dark" ? "dark" : "light"
  const [fontsLoaded, fontError] = useFonts({ Inter, InterSemiBold, InterBold })
  if (fontError) throw fontError
  if (!fontsLoaded)
    return <ActivityIndicator accessibilityLabel="Loading fonts" />

  return (
    <Provider store={store}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <AccessGate>
          <Stack screenOptions={{ headerShown: false }} />
        </AccessGate>
        <AppEvoluConsumers />
        <ConfirmHost />
        <PinPromptHost />
        <ToastHost />
        <Suspense fallback={null}>
          <SentryController />
          <DeviceRegistration />
        </Suspense>
      </TamaguiProvider>
    </Provider>
  )
}
