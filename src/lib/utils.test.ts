import { describe, expect, test } from "vitest"

import { placeholderFadeOpacity } from "@/lib/utils.ts"

describe("placeholderFadeOpacity", () => {
  test("fades a stack from opaque down to 0.2", () => {
    const stack = [0, 1, 2, 3, 4].map((index) =>
      placeholderFadeOpacity(index, 5)
    )

    expect(stack[0]).toBe(1)
    expect(stack.at(-1)).toBeCloseTo(0.2)
    expect(stack).toEqual([...stack].sort((a, b) => b - a))
  })

  // `count - 1` is the divisor, so a lone placeholder must not divide by zero.
  test("keeps a lone placeholder fully opaque", () => {
    expect(placeholderFadeOpacity(0, 1)).toBe(1)
  })
})
