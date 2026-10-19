const { copyFileSync, mkdirSync, writeFileSync } = require("node:fs")
const { join } = require("node:path")
const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
  withDangerousMod,
} = require("expo/config-plugins")

// The palette's `background` (src/theme/palette.ts), as AppLoader draws it,
// so the native splash hands over to the JS loader without a jump.
const background = { light: "#fbfaf7", dark: "#101214" }

/**
 * Android's launch splash with the Payky icon, as web's `#app-loader` and the
 * JS `AppLoader` show it, instead of the prebuild template's Expo logo on
 * white. No `expo-splash-screen` dependency: the template's
 * `Theme.App.SplashScreen` is kept and only its drawables and colors change.
 *
 * - Before Android 12 the window background is a layer list: the background
 *   color with the icon centered at 144 dp (AppLoader's min(36vw, 176)).
 * - Android 12+ ignores that and draws its own splash from
 *   `windowSplashScreen*`; its icon sits in a 240 dp box masked to a 160 dp
 *   circle, so the icon is inset to stay whole inside the circle.
 *
 * Colors follow the system night mode, as AppLoader does before the app's own
 * theme preference is read.
 *
 * @type {import("expo/config-plugins").ConfigPlugin}
 */
const withSplashScreen = (config) => {
  const withResources = withDangerousMod(config, [
    "android",
    (modConfig) => {
      const res = join(
        modConfig.modRequest.platformProjectRoot,
        "app/src/main/res"
      )
      mkdirSync(join(res, "drawable-nodpi"), { recursive: true })
      copyFileSync(
        join(__dirname, "../assets/payky-icon.png"),
        join(res, "drawable-nodpi/splashscreen_icon.png")
      )
      writeFileSync(
        join(res, "drawable/splashscreen_window.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background" />
  <item
    android:width="144dp"
    android:height="144dp"
    android:gravity="center"
    android:drawable="@drawable/splashscreen_icon" />
</layer-list>
`
      )
      writeFileSync(
        join(res, "drawable/splashscreen_icon_inset.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
  android:drawable="@drawable/splashscreen_icon"
  android:inset="22%" />
`
      )
      mkdirSync(join(res, "values-v31"), { recursive: true })
      writeFileSync(
        join(res, "values-v31/styles.xml"),
        `<resources>
  <style name="Theme.App.SplashScreen" parent="AppTheme">
    <item name="android:windowBackground">@drawable/splashscreen_window</item>
    <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>
    <item name="android:windowSplashScreenAnimatedIcon">@drawable/splashscreen_icon_inset</item>
  </style>
</resources>
`
      )
      return modConfig
    },
  ])

  const withStyles = withAndroidStyles(withResources, (stylesConfig) => {
    stylesConfig.modResults = AndroidConfig.Styles.assignStylesValue(
      stylesConfig.modResults,
      {
        add: true,
        parent: { name: "Theme.App.SplashScreen", parent: "AppTheme" },
        name: "android:windowBackground",
        value: "@drawable/splashscreen_window",
      }
    )
    return stylesConfig
  })

  const withColors = withAndroidColors(withStyles, (colorsConfig) => {
    colorsConfig.modResults = AndroidConfig.Colors.assignColorValue(
      colorsConfig.modResults,
      { name: "splashscreen_background", value: background.light }
    )
    return colorsConfig
  })

  return withAndroidColorsNight(withColors, (colorsConfig) => {
    colorsConfig.modResults = AndroidConfig.Colors.assignColorValue(
      colorsConfig.modResults,
      { name: "splashscreen_background", value: background.dark }
    )
    return colorsConfig
  })
}

module.exports = withSplashScreen
