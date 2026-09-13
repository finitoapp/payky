import { describe, expect, test } from "vitest"
import { runMutationWithCompletion } from "./evolu-utils.ts"

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
