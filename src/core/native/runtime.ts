import { Capacitor } from "@capacitor/core"

export type NativeRuntime = "capacitor" | "web"

export function getNativeRuntime(): NativeRuntime {
  if (Capacitor.isNativePlatform()) return "capacitor"

  return "web"
}

export function isNativeWebViewRuntime() {
  return getNativeRuntime() !== "web"
}

export function isAndroidWebView() {
  const userAgent = globalThis.navigator.userAgent

  return /Android/i.test(userAgent) && /; wv\)|\bwv\b/i.test(userAgent)
}
