import { Capacitor } from "@capacitor/core"

export type NativeRuntime = "capacitor" | "web"

export interface NativeRuntimeSignals {
  readonly isCapacitorNativePlatform: boolean
}

export function detectNativeRuntime({
  isCapacitorNativePlatform,
}: NativeRuntimeSignals): NativeRuntime {
  if (isCapacitorNativePlatform) return "capacitor"

  return "web"
}

export function getNativeRuntime(): NativeRuntime {
  return detectNativeRuntime({
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
