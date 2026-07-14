import { describe, expect, test, vi } from "vitest"
import {
  createScreenWakeLockController,
  type WakeLockSentinelLike,
} from "./use-screen-wake-lock.ts"

class FakeWakeLockSentinel extends EventTarget {
  constructor(private readonly rejectRelease = false) {
    super()
  }

  readonly release = vi.fn(async () => {
    this.dispatchEvent(new Event("release"))
    if (this.rejectRelease) throw new Error("release failed")
  })
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible"
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

function createDeferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}

function setupController({ rejectRelease = false } = {}) {
  const document = new FakeDocument()
  const window = new EventTarget()
  const sentinels: FakeWakeLockSentinel[] = []
  const request = vi.fn(async () => {
    const sentinel = new FakeWakeLockSentinel(rejectRelease)
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
  test("acquires on start and releases on stop", async () => {
    const { controller, request, sentinels } = setupController()

    controller.start()
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith("screen")

    controller.stop()
    await flushPromises()

    expect(sentinels[0]?.release).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })

  test("releases on page hide without reacquiring until page show", async () => {
    const { controller, request, sentinels, window } = setupController()

    controller.start()
    await flushPromises()

    window.dispatchEvent(new Event("pagehide"))
    await flushPromises()

    expect(sentinels[0]?.release).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event("pageshow"))
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(2)
  })

  test("does not reacquire after stop releases the active lock", async () => {
    const { controller, request, sentinels, window } = setupController()

    controller.start()
    await flushPromises()
    controller.stop()
    await flushPromises()

    window.dispatchEvent(new Event("pageshow"))
    await flushPromises()

    expect(sentinels[0]?.release).toHaveBeenCalledTimes(1)
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

  test("releases a stale in-flight request after stop", async () => {
    const document = new FakeDocument()
    const window = new EventTarget()
    const pendingRequest = createDeferred<WakeLockSentinelLike>()
    const request = vi.fn(() => pendingRequest.promise)
    const controller = createScreenWakeLockController({
      document,
      window,
      wakeLock: { request },
    })
    const sentinel = new FakeWakeLockSentinel()

    controller.start()
    controller.stop()
    pendingRequest.resolve(sentinel)
    await flushPromises()

    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })

  test("ignores request and release failures", async () => {
    const document = new FakeDocument()
    const window = new EventTarget()
    const failedRequest = vi.fn(async () => {
      throw new Error("request failed")
    })
    const failedRequestController = createScreenWakeLockController({
      document,
      window,
      wakeLock: { request: failedRequest },
    })

    failedRequestController.start()
    await flushPromises()
    failedRequestController.stop()

    expect(failedRequest).toHaveBeenCalledTimes(1)

    const { controller, request, sentinels } = setupController({
      rejectRelease: true,
    })
    controller.start()
    await flushPromises()
    controller.stop()
    await flushPromises()

    expect(sentinels[0]?.release).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
