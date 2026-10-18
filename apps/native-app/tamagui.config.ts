import { defaultConfig } from "@tamagui/config/v6"
import { createTamagui } from "tamagui"
import { palette } from "./src/theme/palette"
import { radius } from "./src/theme/tokens"

const inter = {
  family: "Inter",
  face: {
    400: { normal: "Inter" },
    500: { normal: "InterMedium" },
    600: { normal: "InterSemiBold" },
    700: { normal: "InterBold" },
  },
}

// Themes are the web palette. Tamagui `Text` reads `color`, so `foreground`
// is exposed under both names; `border` would clash with the shorthand, so it
// becomes `border-color`.
const nativeTheme = ({
  foreground,
  border,
  ...rest
}: (typeof palette)["light" | "dark"]) => ({
  ...rest,
  foreground,
  color: foreground,
  "border-color": border,
})

const nativeThemes = {
  light: { ...defaultConfig.themes.light, ...nativeTheme(palette.light) },
  dark: { ...defaultConfig.themes.dark, ...nativeTheme(palette.dark) },
}

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  fonts: {
    body: { ...defaultConfig.fonts.body, ...inter },
    heading: { ...defaultConfig.fonts.heading, ...inter },
  },
  themes: nativeThemes,
  tokens: {
    ...defaultConfig.tokens,
    radius: { ...defaultConfig.tokens.radius, ...radius },
  },
})

type NativeTamaguiConfig = typeof tamaguiConfig

declare module "tamagui" {
  interface TamaguiCustomConfig extends NativeTamaguiConfig {}
}
