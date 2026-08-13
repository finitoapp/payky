import { Capacitor } from "@capacitor/core"
import assertNever from "assert-never"

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
  switch (runtime) {
    case "web":
      return false
    case "capacitor":
      return true
  }

  return assertNever(runtime)
}

export function isNativeWebViewRuntime() {
  return isPluginNativeRuntime()
}

export function isAndroidWebView() {
  const userAgent = globalThis.navigator.userAgent

  return /Android/i.test(userAgent) && /; wv\)|\bwv\b/i.test(userAgent)
}
