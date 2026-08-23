import { describe, expect, test } from "vitest"

import { normalizeMnemonic } from "./account-utils.ts"

describe("normalizeMnemonic", () => {
  test("collapses internal whitespace runs to a single space", () => {
    expect(normalizeMnemonic("abandon   ability\tabout\nabove")).toBe(
      "abandon ability about above"
    )
  })

  test("trims leading and trailing whitespace", () => {
    expect(normalizeMnemonic("  abandon ability  ")).toBe("abandon ability")
  })

  test("leaves an already-normalized mnemonic unchanged", () => {
    expect(normalizeMnemonic("abandon ability able")).toBe(
      "abandon ability able"
    )
  })
})
