import { describe, expect, test } from "vitest"

import { detectNativeRuntime, isPluginNativeRuntime } from "./runtime.ts"

describe("native runtime detection", () => {
  test("recognizes Capacitor as a native plugin runtime", () => {
    expect(
      detectNativeRuntime({
        isCapacitorNativePlatform: true,
      })
    ).toBe("capacitor")
  })

  test("treats regular browsers and PWAs as unsupported for native plugins", () => {
    const runtime = detectNativeRuntime({
      isCapacitorNativePlatform: false,
    })

    expect(runtime).toBe("web")
    expect(isPluginNativeRuntime(runtime)).toBe(false)
  })
})
