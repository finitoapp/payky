import { Capacitor } from "@capacitor/core"

export type NativeRuntime = "capacitor" | "tauri" | "web"

export interface NativeRuntimeSignals {
  readonly hasTauriInternals: boolean
  readonly isCapacitorNativePlatform: boolean
}

export function detectNativeRuntime({
  hasTauriInternals,
  isCapacitorNativePlatform,
}: NativeRuntimeSignals): NativeRuntime {
  if (isCapacitorNativePlatform) return "capacitor"
  if (hasTauriInternals) return "tauri"

  return "web"
}

export function getNativeRuntime(): NativeRuntime {
  return detectNativeRuntime({
    hasTauriInternals: hasTauriInternals(),
    isCapacitorNativePlatform: Capacitor.isNativePlatform(),
  })
}

export function isPluginNativeRuntime(runtime = getNativeRuntime()): boolean {
  return runtime !== "web"
}

export function isNativeWebViewRuntime() {
  return isPluginNativeRuntime()
}

export function isAndroidWebView() {
  const userAgent = globalThis.navigator.userAgent

  return /Android/i.test(userAgent) && /; wv\)|\bwv\b/i.test(userAgent)
}

function hasTauriInternals(): boolean {
  const tauriGlobal = globalThis as typeof globalThis & {
    readonly __TAURI__?: unknown
    readonly __TAURI_INTERNALS__?: unknown
  }

  return (
    tauriGlobal.__TAURI__ !== undefined ||
    tauriGlobal.__TAURI_INTERNALS__ !== undefined
  )
}
