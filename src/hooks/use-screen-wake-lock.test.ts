import { describe, expect, test, vi } from "vitest"
import { createScreenWakeLockController } from "./use-screen-wake-lock.ts"

class FakeWakeLockSentinel extends EventTarget {
  readonly release = vi.fn(async () => {
    this.dispatchEvent(new Event("release"))
  })
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible"
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  if (resolve === undefined) {
    throw new Error("Deferred promise resolver was not initialized")
  }

  return { promise, resolve }
}

function setupController() {
  const document = new FakeDocument()
  const window = new EventTarget()
  const sentinels: FakeWakeLockSentinel[] = []
  const request = vi.fn(async () => {
    const sentinel = new FakeWakeLockSentinel()
    sentinels.push(sentinel)
    return sentinel
  })
  const controller = createScreenWakeLockController({
    document,
    window,
    wakeLock: { request },
  })

  return {
    controller,
    document,
    request,
    sentinels,
    window,
  }
}

describe("createScreenWakeLockController", () => {
  test("releases on page hide without immediately reacquiring before page show", async () => {
    const { controller, request, sentinels, window } = setupController()

    controller.start()
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
    const [firstSentinel] = sentinels
    expect(firstSentinel).toBeDefined()

    window.dispatchEvent(new Event("pagehide"))
    await flushPromises()

    expect(firstSentinel?.release).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event("pageshow"))
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(2)
  })

  test("does not reacquire after stop releases the active lock", async () => {
    const { controller, request, sentinels } = setupController()

    controller.start()
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
    const [firstSentinel] = sentinels
    expect(firstSentinel).toBeDefined()

    controller.stop()
    await flushPromises()

    expect(firstSentinel?.release).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })

  test("reacquires when a visible active lock is released by the browser", async () => {
    const { controller, request, sentinels } = setupController()

    controller.start()
    await flushPromises()

    sentinels[0]?.dispatchEvent(new Event("release"))
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(2)
  })

  test("releases on visibility loss and reacquires when visible again", async () => {
    const { controller, document, request, sentinels } = setupController()

    controller.start()
    await flushPromises()

    document.visibilityState = "hidden"
    document.dispatchEvent(new Event("visibilitychange"))
    await flushPromises()

    expect(sentinels[0]?.release).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)

    document.visibilityState = "visible"
    document.dispatchEvent(new Event("visibilitychange"))
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(2)
  })

  test("does not start duplicate acquire while the first request is pending", async () => {
    const document = new FakeDocument()
    const window = new EventTarget()
    const deferredSentinel = createDeferred<FakeWakeLockSentinel>()
    const request = vi.fn(() => deferredSentinel.promise)
    const controller = createScreenWakeLockController({
      document,
      window,
      wakeLock: { request },
    })

    controller.start()

    expect(request).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event("pageshow"))
    document.visibilityState = "visible"
    document.dispatchEvent(new Event("visibilitychange"))

    expect(request).toHaveBeenCalledTimes(1)

    deferredSentinel.resolve(new FakeWakeLockSentinel())
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
  })

  test("retries after a stale pending acquire resolves while visible", async () => {
    const document = new FakeDocument()
    const window = new EventTarget()
    const firstDeferredSentinel = createDeferred<FakeWakeLockSentinel>()
    const firstSentinel = new FakeWakeLockSentinel()
    const secondSentinel = new FakeWakeLockSentinel()
    const request = vi
      .fn<() => Promise<FakeWakeLockSentinel>>()
      .mockReturnValueOnce(firstDeferredSentinel.promise)
      .mockResolvedValueOnce(secondSentinel)
    const controller = createScreenWakeLockController({
      document,
      window,
      wakeLock: { request },
    })

    controller.start()

    expect(request).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event("pagehide"))
    window.dispatchEvent(new Event("pageshow"))

    expect(request).toHaveBeenCalledTimes(1)

    firstDeferredSentinel.resolve(firstSentinel)
    await flushPromises()

    expect(firstSentinel.release).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(2)
  })
})
