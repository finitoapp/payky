/**
 * The web app's Tailwind scales the native ui kit uses, in px. Spacing has no
 * token scale: Tailwind's 4 px step is written out as numbers (`p-4` → 16),
 * and each ui component's doc comment lists the classes it mirrors.
 */

/** `--radius: 0.55rem` with `rounded-sm/md/lg/xl`, plus Tailwind's fixed radii. */
export const radius = {
  xs: 2,
  sm: 4.8,
  md: 6.8,
  lg: 8.8,
  xl: 12.8,
  "2xl": 16,
  "4xl": 32,
  full: 9999,
} as const

/** `text-xs` … `text-3xl`. Never pair these with a numeric `lineHeight`. */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
} as const

/**
 * `font-normal`/`medium`/`semibold`/`bold`. Only Inter 400, 600 and 700 are
 * loaded, so `medium` (500 on web) renders as 600 until Inter 500 is added.
 */
export const fontWeight = {
  normal: "400",
  medium: "600",
  semibold: "600",
  bold: "700",
} as const
