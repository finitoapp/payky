import { describe, expect, test } from "vitest"

import { getPreferredDeviceLanguage } from "./device-utils.ts"

describe("getPreferredDeviceLanguage", () => {
  test("matches Czech locale variants", () => {
    expect(getPreferredDeviceLanguage("cs")).toBe("cs")
    expect(getPreferredDeviceLanguage("cs-CZ")).toBe("cs")
  })

  test("matches Slovak locale variants", () => {
    expect(getPreferredDeviceLanguage("sk")).toBe("sk")
    expect(getPreferredDeviceLanguage("sk-SK")).toBe("sk")
  })

  test("falls back to English for any other locale", () => {
    expect(getPreferredDeviceLanguage("en")).toBe("en")
    expect(getPreferredDeviceLanguage("en-US")).toBe("en")
    expect(getPreferredDeviceLanguage("de-DE")).toBe("en")
    expect(getPreferredDeviceLanguage("")).toBe("en")
  })
})
