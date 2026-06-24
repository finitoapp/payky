import { installAndroidWebViewLocksPolyfill } from "@/polyfills/android-webview-locks.ts"
import { ensureDisposableStackPolyfill } from "@/polyfills/disposable-stack.ts"

ensureDisposableStackPolyfill()
installAndroidWebViewLocksPolyfill()
