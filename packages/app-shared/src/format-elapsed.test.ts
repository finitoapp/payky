import { describe, expect, test } from "vitest"
import { formatElapsed } from "./format-elapsed.ts"

describe("formatElapsed", () => {
  test("shows minutes under an hour, then hours and leftover minutes", () => {
    expect(formatElapsed(59_999)).toBe("0 min")
    expect(formatElapsed(42 * 60_000)).toBe("42 min")
    expect(formatElapsed(60 * 60_000)).toBe("1 hr")
    expect(formatElapsed(65 * 60_000)).toBe("1 hr 5 min")
    expect(formatElapsed(-5_000)).toBe("0 min")
  })
})
