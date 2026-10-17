import InterBold from "@tamagui/font-inter/otf/Inter-Bold.otf"
import Inter from "@tamagui/font-inter/otf/Inter-Regular.otf"
import InterSemiBold from "@tamagui/font-inter/otf/Inter-SemiBold.otf"
import { useFonts } from "expo-font"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { ActivityIndicator, useColorScheme } from "react-native"
import { TamaguiProvider } from "tamagui"
import { tamaguiConfig } from "../tamagui.config.ts"

export default function RootLayout() {
  const theme = useColorScheme() === "dark" ? "dark" : "light"
  const [fontsLoaded, fontError] = useFonts({ Inter, InterSemiBold, InterBold })
  if (fontError) throw fontError
  if (!fontsLoaded)
    return <ActivityIndicator accessibilityLabel="Loading fonts" />

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }} />
    </TamaguiProvider>
  )
}
