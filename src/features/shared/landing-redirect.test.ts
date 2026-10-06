import { afterEach, describe, expect, test, vi } from "vitest"

import {
  landingLanguageFromPath,
  preferredLandingLanguage,
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
