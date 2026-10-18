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
  android: { package: "me.payky.nativepreview", allowBackup: false },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-camera",
      {
        cameraPermission:
          "Payky uses the camera to scan payment, pairing and product codes.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    // No organization/project/auth token: builds upload no source maps.
    "@sentry/react-native/expo",
    ["expo-sqlite", { useSQLCipher: true }],
    "./plugins/with-no-data-extraction.cjs",
    "./plugins/with-library-compile-sdk.cjs",
    "./plugins/with-release-proguard-rules.cjs",
  ],
} satisfies ExpoConfig
