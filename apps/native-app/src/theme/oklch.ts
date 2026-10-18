/**
 * OKLCH → sRGB hex, the conversion `palette.ts` was generated with and
 * `palette.test.ts` re-runs against the web theme. React Native has no OKLCH
 * colors, so the web palette is shipped precomputed.
 *
 * Out-of-gamut colors are clipped per channel; browsers map the chroma
 * instead, so a saturated color can differ by a step or two from Chrome.
 */

export interface Oklch {
  readonly l: number
  readonly c: number
  readonly h: number
  readonly alpha: number
}

const toByte = (linear: number): number => {
  const clipped = Math.min(1, Math.max(0, linear))
  const srgb =
    clipped <= 0.0031308
      ? 12.92 * clipped
      : 1.055 * clipped ** (1 / 2.4) - 0.055
  return Math.round(srgb * 255)
}

const hexByte = (value: number): string => value.toString(16).padStart(2, "0")

export const oklchToHex = ({ l, c, h, alpha }: Oklch): string => {
  const radians = (h * Math.PI) / 180
  const a = c * Math.cos(radians)
  const b = c * Math.sin(radians)
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const
  const rgb = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ].map(toByte)
  const alphaHex = alpha < 1 ? hexByte(Math.round(alpha * 255)) : ""
  return `#${rgb.map(hexByte).join("")}${alphaHex}`
}

const parseNumber = (token: string | undefined): number => {
  if (token === undefined || token === "none") return 0
  return token.endsWith("%")
    ? Number.parseFloat(token) / 100
    : Number.parseFloat(token)
}

/** Parses CSS `oklch(L C H)` / `oklch(L C H / A)`, `L` as a number or a percentage. */
export const parseOklch = (css: string): Oklch | undefined => {
  const match = /^oklch\(\s*([^)]*)\)$/u.exec(css.trim())
  if (match?.[1] === undefined) return undefined
  const [channels, alpha] = match[1].split("/")
  const [l, c, h] = (channels ?? "").trim().split(/\s+/u)
  return {
    l: parseNumber(l),
    c: parseNumber(c),
    h: parseNumber(h),
    alpha: alpha === undefined ? 1 : parseNumber(alpha.trim()),
  }
}

/**
 * CSS `color-mix(in oklch, from, to amount)`: a linear mix of the channels,
 * hue along the shorter arc.
 */
export const mixOklch = (from: Oklch, to: Oklch, amount: number): Oklch => {
  const hueDelta = ((to.h - from.h + 540) % 360) - 180
  const mix = (x: number, y: number) => x + (y - x) * amount
  return {
    l: mix(from.l, to.l),
    c: mix(from.c, to.c),
    h: (from.h + hueDelta * amount + 360) % 360,
    alpha: mix(from.alpha, to.alpha),
  }
}
