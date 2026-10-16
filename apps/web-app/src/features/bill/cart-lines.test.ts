import { describe, expect, test } from "vitest"

import { invertLine, linesNeedDiscard } from "@/features/bill/cart-lines.ts"

describe("linesNeedDiscard (access/0002)", () => {
  const add = { kind: "add" } as const
  const remove = { kind: "remove" } as const

  test("adding a line needs no discard", () => {
    expect(linesNeedDiscard([add, add])).toBe(false)
  })

  test("clearing the cart needs discard", () => {
    expect(linesNeedDiscard([remove, remove])).toBe(true)
  })

  test("undoing an added line needs discard, since it writes a remove", () => {
    const added = {
      kind: "add",
      quantity: 1,
      totalAmount: 100,
    } as unknown as Parameters<typeof invertLine>[0]

    expect(linesNeedDiscard([invertLine(added)])).toBe(true)
  })

  test("redoing a removal needs discard as well", () => {
    expect(linesNeedDiscard([add, remove])).toBe(true)
  })
})
