import { beforeEach, describe, expect, it, vi } from "vitest"

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  close: vi.fn(),
  captureException: vi.fn(),
}))
vi.mock("@sentry/react-native", () => sentry)
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "1" } } }))
vi.mock("./native-env.ts", () => ({
  nativeEnv: { EXPO_PUBLIC_SENTRY_DSN: "https://k@example.test/1" },
}))

vi.stubGlobal("__DEV__", false)

const load = async () => {
  vi.resetModules()
  return import("./error-reporting.ts")
}

describe("native error reporting", () => {
  beforeEach(() => vi.clearAllMocks())

  it("starts nothing and captures nothing until enabled", async () => {
    const reporting = await load()
    reporting.captureReportedError(new Error("boom"))
    reporting.disableErrorReporting()
    expect(sentry.init).not.toHaveBeenCalled()
    expect(sentry.captureException).not.toHaveBeenCalled()
    expect(sentry.close).not.toHaveBeenCalled()
  })

  it("captures while enabled and stops after disabling", async () => {
    const reporting = await load()
    reporting.enableErrorReporting()
    reporting.enableErrorReporting()
    expect(sentry.init).toHaveBeenCalledTimes(1)
    reporting.captureReportedError(new Error("boom"))
    expect(sentry.captureException).toHaveBeenCalledTimes(1)

    reporting.disableErrorReporting()
    expect(sentry.close).toHaveBeenCalledTimes(1)
    reporting.captureReportedError(new Error("again"))
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
  })
})

describe("without a DSN", () => {
  it("never initializes", async () => {
    vi.resetModules()
    vi.doMock("./native-env.ts", () => ({
      nativeEnv: { EXPO_PUBLIC_SENTRY_DSN: undefined },
    }))
    const reporting = await import("./error-reporting.ts")
    reporting.enableErrorReporting()
    expect(sentry.init).not.toHaveBeenCalled()
    expect(reporting.isErrorReportingAvailable()).toBe(false)
  })
})
