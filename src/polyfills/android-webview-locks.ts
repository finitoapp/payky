import { Capacitor } from "@capacitor/core"
import { isAndroidWebView } from "@/core/native/runtime.ts"
import { installOneTabLocks } from "@/polyfills/one-tab-locks.ts"

export const installAndroidWebViewLocksPolyfill = () => {
  if (!Capacitor.isNativePlatform() || !isAndroidWebView()) return
  installOneTabLocks()
}
