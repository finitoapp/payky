import { defaultConfig } from "@tamagui/config/v6"
import { createTamagui } from "tamagui"

const inter = {
  family: "Inter",
  face: {
    400: { normal: "Inter" },
    600: { normal: "InterSemiBold" },
    700: { normal: "InterBold" },
  },
}

// sRGB approximations of the web app's OKLCH palette; native colors do not support OKLCH.
const nativeThemes = {
  light: {
    ...defaultConfig.themes.light,
    background: "#fbfaf7",
    color: "#1c232c",
    card: "#fefdfc",
    primary: "#c04a00",
    "primary-foreground": "#f8f8f8",
    "muted-foreground": "#6e757e",
    "border-color": "#dadee5",
  },
  dark: {
    ...defaultConfig.themes.dark,
    background: "#101214",
    color: "#eff0f1",
    card: "#292c30",
    primary: "#e36b2c",
    "primary-foreground": "#101214",
    "muted-foreground": "#bdc3c7",
    "border-color": "#5f646a",
  },
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
    radius: {
      ...defaultConfig.tokens.radius,
      sm: 4.8,
      md: 6.8,
      lg: 8.8,
      xl: 12.8,
    },
  },
})

type NativeTamaguiConfig = typeof tamaguiConfig

declare module "tamagui" {
  interface TamaguiCustomConfig extends NativeTamaguiConfig {}
}
