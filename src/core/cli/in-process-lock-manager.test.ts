import { describe, expect, test } from "vitest"

import { createInProcessLockManager } from "./in-process-lock-manager.ts"

describe("createInProcessLockManager", () => {
  test("runs the callback with an exclusive lock", async () => {
    const lockManager = createInProcessLockManager()

    const result = await lockManager.request("a", (lock) => {
      expect(lock).toEqual({ mode: "exclusive", name: "a" })
      return "done"
    })

    expect(result).toBe("done")
  })

  test("serializes requests for the same name", async () => {
    const lockManager = createInProcessLockManager()
    const order: Array<string> = []
    const first = Promise.withResolvers<void>()

    const firstRequest = lockManager.request("a", async () => {
      order.push("first start")
      await first.promise
      order.push("first end")
    })
    const secondRequest = lockManager.request("a", () => {
      order.push("second")
    })

    first.resolve()
    await Promise.all([firstRequest, secondRequest])
    expect(order).toEqual(["first start", "first end", "second"])
  })

  test("ifAvailable passes null while the lock is held", async () => {
    const lockManager = createInProcessLockManager()
    const held = Promise.withResolvers<void>()

    const holder = lockManager.request("a", () => held.promise)
    const whileHeld = await lockManager.request(
      "a",
      { ifAvailable: true },
      (lock) => lock
    )
    expect(whileHeld).toBeNull()

    held.resolve()
    await holder

    const afterRelease = await lockManager.request(
      "a",
      { ifAvailable: true },
      (lock) => lock
    )
    expect(afterRelease).toEqual({ mode: "exclusive", name: "a" })
  })

  test("releases the lock when the callback rejects", async () => {
    const lockManager = createInProcessLockManager()

    await expect(
      lockManager.request("a", () => {
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")

    const afterFailure = await lockManager.request(
      "a",
      { ifAvailable: true },
      (lock) => lock
    )
    expect(afterFailure).toEqual({ mode: "exclusive", name: "a" })
  })

  test("does not block requests for other names", async () => {
    const lockManager = createInProcessLockManager()
    const held = Promise.withResolvers<void>()

    const holder = lockManager.request("a", () => held.promise)
    const other = await lockManager.request(
      "b",
      { ifAvailable: true },
      (lock) => lock
    )
    expect(other).toEqual({ mode: "exclusive", name: "b" })

    held.resolve()
    await holder
  })

  test("rejects unsupported shared and steal requests", async () => {
    const lockManager = createInProcessLockManager()

    await expect(
      lockManager.request("a", { mode: "shared" }, () => undefined)
    ).rejects.toThrow(TypeError)
    await expect(
      lockManager.request("a", { steal: true }, () => undefined)
    ).rejects.toThrow(TypeError)
  })
})
