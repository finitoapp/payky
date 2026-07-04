import { describe, expect, test } from "vitest"

import { detectNativeRuntime, isPluginNativeRuntime } from "./runtime.ts"

describe("native runtime detection", () => {
  test("recognizes Capacitor as a native plugin runtime", () => {
    expect(
      detectNativeRuntime({
        hasTauriInternals: false,
        isCapacitorNativePlatform: true,
      })
    ).toBe("capacitor")
  })

  test("recognizes Tauri as a native plugin runtime", () => {
    expect(
      detectNativeRuntime({
        hasTauriInternals: true,
        isCapacitorNativePlatform: false,
      })
    ).toBe("tauri")
  })

  test("treats regular browsers and PWAs as unsupported for native plugins", () => {
    const runtime = detectNativeRuntime({
      hasTauriInternals: false,
      isCapacitorNativePlatform: false,
    })

    expect(runtime).toBe("web")
    expect(isPluginNativeRuntime(runtime)).toBe(false)
  })
})
