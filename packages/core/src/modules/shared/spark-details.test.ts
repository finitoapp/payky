import { describe, expect, test } from "vitest"

import { assertHasSparkIdentifier } from "./spark-details.ts"

describe("assertHasSparkIdentifier", () => {
  test("does not throw when detail is absent", () => {
    expect(() =>
      assertHasSparkIdentifier(undefined, "should not throw")
    ).not.toThrow()
  })

  test("does not throw when detail has a lightning identifier", () => {
    expect(() =>
      assertHasSparkIdentifier({ lightning: {} }, "should not throw")
    ).not.toThrow()
  })

  test("does not throw when detail has a spark invoice identifier", () => {
    expect(() =>
      assertHasSparkIdentifier({ sparkInvoice: {} }, "should not throw")
    ).not.toThrow()
  })

  test("throws the given message when detail has neither identifier", () => {
    expect(() => assertHasSparkIdentifier({}, "missing identifier")).toThrow(
      "missing identifier"
    )
  })
})
