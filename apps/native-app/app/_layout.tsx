import InterBold from "@tamagui/font-inter/otf/Inter-Bold.otf"
import Inter from "@tamagui/font-inter/otf/Inter-Regular.otf"
import InterSemiBold from "@tamagui/font-inter/otf/Inter-SemiBold.otf"
import { useFonts } from "expo-font"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { createStore, Provider } from "jotai"
import { useState } from "react"
import { ActivityIndicator, useColorScheme } from "react-native"
import { TamaguiProvider } from "tamagui"
import { AccessGate } from "../src/components/access-gate.tsx"
import { ConfirmHost } from "../src/components/confirm-host.tsx"
import { ToastHost } from "../src/components/toast-host.tsx"
import { tamaguiConfig } from "../tamagui.config.ts"

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
        <ConfirmHost />
        <ToastHost />
      </TamaguiProvider>
    </Provider>
  )
}
