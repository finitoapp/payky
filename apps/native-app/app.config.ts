import type { ExpoConfig } from "expo/config"
import { version } from "../../package.json"

const [year, month, micro] = version.split(".").map(Number) as [
  number,
  number,
  number,
]

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
  android: {
    package: "me.payky.nativepreview",
    allowBackup: false,
    versionCode: year * 1_000_000 + month * 10_000 + micro,
  },
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
    "./plugins/with-hardware-key-events.cjs",
    "./plugins/with-switchio-result-capture.cjs",
    "./plugins/with-library-compile-sdk.cjs",
    "./plugins/with-release-proguard-rules.cjs",
  ],
} satisfies ExpoConfig
