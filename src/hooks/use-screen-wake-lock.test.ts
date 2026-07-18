import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  request: vi.fn(async () => true),
  useEffect: vi.fn(),
  useWakeLock: vi.fn(),
}))

vi.mock("react", () => ({
  useEffect: mocks.useEffect,
}))

vi.mock("@dedalik/use-react", () => ({
  useWakeLock: mocks.useWakeLock,
}))

import { useScreenWakeLock } from "./use-screen-wake-lock.ts"

type Effect = () => undefined | (() => void)

describe("useScreenWakeLock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useWakeLock.mockReturnValue({
      isActive: false,
      isSupported: true,
      release: mocks.release,
      request: mocks.request,
    })
  })

  test("requests while enabled and releases on cleanup", () => {
    expect(useScreenWakeLock(true)).toEqual({ supported: true })

    const effect = mocks.useEffect.mock.calls[0]?.[0] as Effect | undefined
    const cleanup = effect?.()

    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(cleanup).toBeTypeOf("function")

    if (typeof cleanup === "function") cleanup()

    expect(mocks.release).toHaveBeenCalledTimes(1)
  })

  test("does not request while disabled", () => {
    useScreenWakeLock(false)

    const effect = mocks.useEffect.mock.calls[0]?.[0] as Effect | undefined

    expect(effect?.()).toBeUndefined()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })

  test("maps the library support flag", () => {
    mocks.useWakeLock.mockReturnValue({
      isActive: false,
      isSupported: false,
      release: mocks.release,
      request: mocks.request,
    })

    expect(useScreenWakeLock(true)).toEqual({ supported: false })
  })
})
