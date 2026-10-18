import { describe, expect, it } from "vitest"
import { maskFioToken, parseFioToken } from "./fio-token.ts"

describe("parseFioToken", () => {
  it("trims a token", () => {
    expect(parseFioToken("  abc123  ")).toMatchObject({
      ok: true,
      token: "abc123",
    })
  })

  it("asks for a token when blank", () => {
    expect(parseFioToken("   ")).toEqual({
      ok: false,
      errorKey: "settings.fioPlugin.token.required",
    })
  })

  it("refuses a token longer than 255 characters", () => {
    expect(parseFioToken("a".repeat(256))).toEqual({
      ok: false,
      errorKey: "settings.fioPlugin.token.invalid",
    })
    expect(parseFioToken("a".repeat(255)).ok).toBe(true)
  })
})

describe("maskFioToken", () => {
  it("shows only the last four characters", () => {
    expect(maskFioToken("secret-token-1234")).toBe("********1234")
    expect(maskFioToken("")).toBe("********")
  })
})
