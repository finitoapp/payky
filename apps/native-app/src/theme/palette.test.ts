import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { expect, test } from "vitest"
import { mixOklch, type Oklch, oklchToHex, parseOklch } from "./oklch"
import { palette } from "./palette"

/**
 * Re-derives `palette.ts` from the web theme, so a change to
 * `apps/web-app/src/index.css` fails here until the native palette follows.
 */

const webAppDir = path.resolve(import.meta.dirname, "../../../web-app")
const indexCss = readFileSync(path.join(webAppDir, "src/index.css"), "utf8")
const tailwindThemeCss = readFileSync(
  createRequire(path.join(webAppDir, "package.json")).resolve(
    "tailwindcss/theme.css"
  ),
  "utf8"
)

const declarations = (css: string, selector: string): Map<string, string> => {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf("}", start))
  return new Map(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/gu)].map(
      (match) => [match[1] ?? "", (match[2] ?? "").trim()] as const
    )
  )
}

const tailwindColors = declarations(tailwindThemeCss, "@theme default")

const resolve = (vars: Map<string, string>, name: string): Oklch => {
  const raw = vars.get(name) ?? ""
  const reference = /^var\(--([\w-]+)\)$/u.exec(raw)?.[1]
  const value =
    reference === undefined ? raw : (tailwindColors.get(reference) ?? "")
  const color = parseOklch(value)
  if (color === undefined) throw new Error(`--${name}: ${raw} is not oklch`)
  return color
}

/** The web theme variables the native themes carry. */
const webKeys = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "border",
  "input",
  "ring",
  "switch-null",
  "switch-null-dot",
  "switch-true",
  "switch-false",
  "success",
  "success-foreground",
  "info",
  "info-foreground",
  "warning",
  "warning-foreground",
  "invert",
  "invert-foreground",
] as const

const derive = (selector: string): Record<string, string> => {
  const vars = declarations(indexCss, selector)
  const color = (name: string) => resolve(vars, name)
  const alpha = (name: string, value: number) =>
    oklchToHex({ ...color(name), alpha: value })
  const base = Object.fromEntries(
    webKeys.map((key) => [key, oklchToHex(color(key))])
  )
  return {
    ...base,
    "card-ring": alpha("foreground", 0.1),
    "foreground-40": alpha("foreground", 0.4),
    "foreground-60": alpha("foreground", 0.6),
    "primary-pressed": alpha("primary", 0.8),
    "primary-5": alpha("primary", 0.05),
    "secondary-hover": oklchToHex(
      mixOklch(color("secondary"), color("foreground"), 0.05)
    ),
    "input-30": alpha("input", 0.3),
    "input-50": alpha("input", 0.5),
    "input-80": alpha("input", 0.8),
    "destructive-5": alpha("destructive", 0.05),
    "destructive-10": alpha("destructive", 0.1),
    "destructive-20": alpha("destructive", 0.2),
    "destructive-30": alpha("destructive", 0.3),
    "destructive-40": alpha("destructive", 0.4),
    "destructive-90": alpha("destructive", 0.9),
    "muted-50": alpha("muted", 0.5),
    "destructive-4": alpha("destructive", 0.04),
    "info-4": alpha("info", 0.04),
    "info-30": alpha("info", 0.3),
    "success-4": alpha("success", 0.04),
    "success-30": alpha("success", 0.3),
    "warning-4": alpha("warning", 0.04),
    "warning-30": alpha("warning", 0.3),
    "invert-foreground-70": alpha("invert-foreground", 0.7),
    "muted-foreground-30": alpha("muted-foreground", 0.3),
    "primary-10": alpha("primary", 0.1),
    "primary-20": alpha("primary", 0.2),
    "muted-20": alpha("muted", 0.2),
    "info-10": alpha("info", 0.1),
    "info-40": alpha("info", 0.4),
    "primary-30": alpha("primary", 0.3),
    "info-15": alpha("info", 0.15),
    "background-60": alpha("background", 0.6),
    "background-70": alpha("background", 0.7),
    "primary-15": alpha("primary", 0.15),
    "foreground-70": alpha("foreground", 0.7),
    "warning-10": alpha("warning", 0.1),
    "success-10": alpha("success", 0.1),
  }
}

const channels = (hex: string): ReadonlyArray<number> =>
  (hex.slice(1).match(/../gu) ?? []).map((pair) => Number.parseInt(pair, 16))

const expectClose = (
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>
) => {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort())
  for (const [key, hex] of Object.entries(expected)) {
    const got = channels(actual[key] ?? "")
    const want = channels(hex)
    expect(got.length, key).toBe(want.length)
    want.forEach((channel, index) => {
      expect(
        Math.abs((got[index] ?? -99) - channel),
        `${key}: ${actual[key]} vs ${hex}`
      ).toBeLessThanOrEqual(1)
    })
  }
}

test("the light palette matches the web :root theme", () => {
  expectClose(palette.light, derive(":root"))
})

test("the dark palette matches the web .dark theme", () => {
  expectClose(palette.dark, derive(".dark"))
})

test("oklchToHex converts known colors", () => {
  expect(oklchToHex({ l: 1, c: 0, h: 0, alpha: 1 })).toBe("#ffffff")
  expect(oklchToHex({ l: 0, c: 0, h: 0, alpha: 0.5 })).toBe("#00000080")
  // The sRGB red primary.
  expect(oklchToHex({ l: 0.62796, c: 0.25768, h: 29.234, alpha: 1 })).toBe(
    "#ff0000"
  )
})
