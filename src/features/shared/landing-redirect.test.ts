import { describe, expect, test } from "vitest"

import { shouldRedirectToLanding } from "./landing-redirect.ts"

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
