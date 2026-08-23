import { describe, expect, test } from "vitest"

import { assertHasSparkIdentifier, runMutationWithCompletion } from "./utils.ts"

describe("runMutationWithCompletion", () => {
  test("resolves with the mutation's result once onComplete fires", async () => {
    const result = await runMutationWithCompletion((options) => {
      options.onComplete?.()
      return "mutated"
    })

    expect(result).toBe("mutated")
  })

  test("waits for onComplete before resolving", async () => {
    let resolved = false

    const promise = runMutationWithCompletion((options) => {
      setTimeout(() => options.onComplete?.(), 0)
      return "mutated"
    }).then((result) => {
      resolved = true
      return result
    })

    expect(resolved).toBe(false)
    await expect(promise).resolves.toBe("mutated")
    expect(resolved).toBe(true)
  })
})

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
