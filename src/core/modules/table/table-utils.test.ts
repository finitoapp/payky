import { describe, expect, test } from "vitest"

import { generateTableCode } from "./table-utils.ts"

describe("generateTableCode", () => {
  test("generates an 8-character code from the unambiguous alphabet", () => {
    const code = generateTableCode()

    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/)
  })

  test("generates different codes across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateTableCode()))

    expect(codes.size).toBeGreaterThan(1)
  })
})
