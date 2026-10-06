import { Capacitor } from "@capacitor/core"
import { z } from "zod"

import { getPreferredDeviceLanguage } from "@/core/modules/device/device-utils.ts"
import type { Language } from "@/i18n/resources.ts"
import { jsonCodec } from "@/zod-utils.ts"

// Presence alone is the marker, so there is no value to decode.
const appEnteredStorageKey = "payky.appEntered"
const landingLanguageStorageKey = "payky.landingLanguage"

/** One prerendered page per language (landing/0002). */
export const landingPaths = {
  cs: "/landing",
  en: "/landing/en",
  sk: "/landing/sk",
} as const satisfies Record<Language, string>

export const LandingLanguageSchema: z.ZodType<Language> = z.enum([
  "cs",
  "en",
  "sk",
])

const LandingLanguageJson = jsonCodec(LandingLanguageSchema)

export interface LandingRedirectEnvironment {
  readonly nativePlatform: boolean
  readonly installedPwa: boolean
  readonly appEntered: boolean
}

/**
 * Whether a device with no account goes to the landing page rather than to
 * onboarding (landing/0001): only a browser tab that has never opened the
 * app does.
 */
export const shouldRedirectToLanding = ({
  nativePlatform,
  installedPwa,
  appEntered,
}: LandingRedirectEnvironment): boolean =>
  !nativePlatform && !installedPwa && !appEntered

export function readLandingRedirectEnvironment(): LandingRedirectEnvironment {
  return {
    nativePlatform: Capacitor.isNativePlatform(),
    installedPwa:
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari's home-screen apps report themselves only through this.
      ("standalone" in navigator && navigator.standalone === true),
    appEntered: readAppEntered(),
  }
}

function readAppEntered(): boolean {
  try {
    return localStorage.getItem(appEnteredStorageKey) !== null
  } catch {
    // Storage blocked: the visitor sees the landing page again, nothing worse.
    return false
  }
}

export function markAppEntered(): void {
  try {
    localStorage.setItem(appEnteredStorageKey, "1")
  } catch {
    // Same as above.
  }
}

/** The language picked on the landing page before, else the browser's. */
export function preferredLandingLanguage(): Language {
  try {
    const stored = localStorage.getItem(landingLanguageStorageKey)
    if (stored !== null) {
      const parsed = z.safeDecode(LandingLanguageJson, stored)
      if (parsed.success) return parsed.data
    }
  } catch {
    // Storage blocked: fall back to the browser's language.
  }
  return getPreferredDeviceLanguage(navigator.language)
}

export function rememberLandingLanguage(language: Language): void {
  try {
    localStorage.setItem(
      landingLanguageStorageKey,
      z.encode(LandingLanguageJson, language)
    )
  } catch {
    // Storage blocked: the next redirect uses the browser's language.
  }
}

/** The language of the landing page at `pathname`, Czech for `/landing`. */
export function landingLanguageFromPath(pathname: string): Language {
  const normalized = pathname.replace(/\/+$/u, "")
  const match = Object.entries(landingPaths).find(
    ([, path]) => path === normalized
  )
  return LandingLanguageSchema.catch("cs").parse(match?.[0])
}
