import { palette } from "./palette.ts"

type Palette = (typeof palette)["light" | "dark"]

type Tones = Record<
  | "button-outline"
  | "button-outline-border"
  | "button-outline-pressed"
  | "button-ghost-pressed"
  | "destructive-tint"
  | "destructive-tint-pressed"
  | "input-bg"
  | "input-disabled"
  | "switch-track-off"
  | "switch-thumb-on"
  | "switch-thumb-off"
  | "checkbox-bg",
  string
>

/**
 * Tones web picks with a `dark:` class, which a Tamagui variant cannot
 * express: each is one theme key with a light and a dark value.
 */
const lightTones = (colors: Palette): Tones => ({
  // ui/button outline: `border-border bg-background hover:bg-muted`
  "button-outline": colors.background,
  "button-outline-border": colors.border,
  "button-outline-pressed": colors.muted,
  // ui/button ghost: `hover:bg-muted`
  "button-ghost-pressed": colors.muted,
  // ui/button and ui/badge destructive: `bg-destructive/10`, button `hover:bg-destructive/20`
  "destructive-tint": colors["destructive-10"],
  "destructive-tint-pressed": colors["destructive-20"],
  // ui/input: `bg-transparent disabled:bg-input/50`
  "input-bg": "transparent",
  "input-disabled": colors["input-50"],
  // ui/switch: `data-unchecked:bg-input`, thumb `bg-background`
  "switch-track-off": colors.input,
  "switch-thumb-on": colors.background,
  "switch-thumb-off": colors.background,
  // ui/checkbox: `bg-background`
  "checkbox-bg": colors.background,
})

const darkTones = (colors: Palette): Tones => ({
  // `dark:border-input dark:bg-input/30 dark:hover:bg-input/50`
  "button-outline": colors["input-30"],
  "button-outline-border": colors.input,
  "button-outline-pressed": colors["input-50"],
  // `dark:hover:bg-muted/50`
  "button-ghost-pressed": colors["muted-50"],
  // `dark:bg-destructive/20 dark:hover:bg-destructive/30`
  "destructive-tint": colors["destructive-20"],
  "destructive-tint-pressed": colors["destructive-30"],
  // `dark:bg-input/30 dark:disabled:bg-input/80`
  "input-bg": colors["input-30"],
  "input-disabled": colors["input-80"],
  // `dark:data-unchecked:bg-input/80`, thumb `dark:data-checked:bg-primary-foreground
  // dark:data-unchecked:bg-foreground`
  "switch-track-off": colors["input-80"],
  "switch-thumb-on": colors["primary-foreground"],
  "switch-thumb-off": colors.foreground,
  // `dark:bg-input/30`
  "checkbox-bg": colors["input-30"],
})

/**
 * The web palette as Tamagui theme keys. Tamagui `Text` reads `color`, so
 * `foreground` is exposed under both names; `border` would clash with the
 * shorthand, so it becomes `border-color`.
 */
const appTheme = (
  { foreground, border, ...colors }: Palette,
  tones: Tones
) => ({
  ...colors,
  foreground,
  color: foreground,
  "border-color": border,
  ...tones,
})

export const appThemes = {
  light: appTheme(palette.light, lightTones(palette.light)),
  dark: appTheme(palette.dark, darkTones(palette.dark)),
}

/** A theme key a native color prop accepts. */
export type ThemeColor = keyof (typeof appThemes)["dark"]
