import { describe, expect, it } from "vitest"
import { resolveTheme } from "./theme-preference.ts"

describe("resolveTheme", () => {
  it("follows the system scheme for system, light when it is unknown", () => {
    expect(resolveTheme("system", "dark")).toBe("dark")
    expect(resolveTheme("system", "light")).toBe("light")
    expect(resolveTheme("system", null)).toBe("light")
  })

  it("forces light or dark whatever the system says", () => {
    expect(resolveTheme("dark", "light")).toBe("dark")
    expect(resolveTheme("light", "dark")).toBe("light")
  })
})
