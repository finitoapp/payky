import { expect, test } from "vitest"
import { decideClosedOnOpen } from "./use-redirect-if-closed-on-open.ts"

test("keeps the decision while the screen shows the same arrival", () => {
  const open = { arrival: "a", closedOnOpen: false }

  // Paid while its screen is open: it still shows its success.
  expect(decideClosedOnOpen(open, "a", true)).toBe(open)
})

test("keeps a closed-on-open decision for the same arrival", () => {
  const closed = { arrival: "a", closedOnOpen: true }

  expect(decideClosedOnOpen(closed, "a", false)).toBe(closed)
})

test("decides again from the current state for another arrival", () => {
  const open = { arrival: "a", closedOnOpen: false }

  expect(decideClosedOnOpen(open, "b", true)).toEqual({
    arrival: "b",
    closedOnOpen: true,
  })
  expect(decideClosedOnOpen(open, "b", false)).toEqual({
    arrival: "b",
    closedOnOpen: false,
  })
})
