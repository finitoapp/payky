import { afterEach, describe, expect, test, vi } from "vitest"

import {
  landingLanguageFromPath,
  markAppEntered,
  preferredLandingLanguage,
  readInstallLanguage,
  rememberInstallLanguage,
  shouldRedirectToLanding,
} from "./landing-redirect.ts"

describe("shouldRedirectToLanding", () => {
  test("sends a browser tab that never opened the app to the landing page", () => {
    expect(
      shouldRedirectToLanding({
        nativePlatform: false,
        installedPwa: false,
        appEntered: false,
      })
    ).toBe(true)
  })

  test.each([
    ["the native app", { nativePlatform: true }],
    ["an installed PWA", { installedPwa: true }],
    ["a browser that already opened the app", { appEntered: true }],
  ])("keeps %s out of the landing page", (_, overrides) => {
    expect(
      shouldRedirectToLanding({
        nativePlatform: false,
        installedPwa: false,
        appEntered: false,
        ...overrides,
      })
    ).toBe(false)
  })
})

describe("landingLanguageFromPath", () => {
  test.each([
    ["/landing", "cs"],
    ["/landing/", "cs"],
    ["/landing/en", "en"],
    ["/landing/sk/", "sk"],
    ["/landing/de", "cs"],
  ] as const)("reads %s as %s", (pathname, language) => {
    expect(landingLanguageFromPath(pathname)).toBe(language)
  })
})

describe("preferredLandingLanguage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubBrowser = (stored: string | null) => {
    vi.stubGlobal("navigator", { language: "en-US" })
    vi.stubGlobal("localStorage", { getItem: () => stored })
  }

  test("is Czech whatever the browser's language", () => {
    stubBrowser(null)
    expect(preferredLandingLanguage()).toBe("cs")
  })

  test("is the language picked on the landing page before", () => {
    stubBrowser(JSON.stringify("sk"))
    expect(preferredLandingLanguage()).toBe("sk")
  })
})

describe("install language", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubStorage = () => {
    const items = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    })
  }

  test("keeps the language the app was installed in until onboarding opens", () => {
    stubStorage()
    expect(readInstallLanguage()).toBeUndefined()

    rememberInstallLanguage("sk")
    expect(readInstallLanguage()).toBe("sk")
    expect(readInstallLanguage()).toBe("sk")

    markAppEntered()
    expect(readInstallLanguage()).toBeUndefined()
  })
})
