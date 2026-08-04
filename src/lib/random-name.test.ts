import { describe, expect, test } from "vitest"

import { createRandomDisplayName } from "./random-name.ts"

describe("createRandomDisplayName", () => {
  test("returns an adjective-noun-suffix name", () => {
    expect(createRandomDisplayName()).toMatch(/^[a-z]+-[a-z]+-\d{3}$/)
  })

  test("varies across calls", () => {
    const names = new Set(
      Array.from({ length: 20 }, () => createRandomDisplayName())
    )
    expect(names.size).toBeGreaterThan(1)
  })
})
