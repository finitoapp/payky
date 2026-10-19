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
  // The PWA icon; launchers without adaptive icons use it as is.
  icon: "./assets/payky-icon.png",
  ios: {
    bundleIdentifier: "me.payky.nativepreview",
    supportsTablet: true,
  },
  android: {
    package: "me.payky.nativepreview",
    // The PWA coin on a transparent background, sized to fill the launcher
    // mask (the visible 72 of 108 dp), so no backdrop shows around it.
    adaptiveIcon: {
      foregroundImage: "./assets/launcher-foreground.png",
      backgroundColor: "#00000000",
    },
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
    [
      "expo-splash-screen",
      {
        // The Payky icon on the palette's `background` (src/theme/palette.ts),
        // as AppLoader draws it. The app holds this splash until its first
        // screen is ready (app/_layout.tsx).
        image: "./assets/payky-icon.png",
        imageWidth: 140,
        backgroundColor: "#fbfaf7",
        dark: { image: "./assets/payky-icon.png", backgroundColor: "#101214" },
      },
    ],
    "./plugins/with-no-data-extraction.cjs",
    "./plugins/with-hardware-key-events.cjs",
    "./plugins/with-switchio-result-capture.cjs",
    "./plugins/with-library-compile-sdk.cjs",
    "./plugins/with-release-proguard-rules.cjs",
  ],
} satisfies ExpoConfig
