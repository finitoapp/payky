import type { ExpoConfig } from "expo/config"
import { version } from "../../package.json"

export default {
  name: "Payky Native Preview",
  slug: "payky-native-app",
  scheme: "payky-native-preview",
  version,
  platforms: ["android", "ios"],
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "me.payky.nativepreview",
    supportsTablet: true,
  },
  android: { package: "me.payky.nativepreview" },
  plugins: ["expo-router", "expo-font"],
} satisfies ExpoConfig
