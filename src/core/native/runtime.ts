import { Capacitor } from "@capacitor/core"
import { isTauri } from "@tauri-apps/api/core"

export type NativeRuntime = "tauri" | "capacitor" | "web"

export function getNativeRuntime(): NativeRuntime {
  if (isTauri()) return "tauri"
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
