import { ensureDisposableStackPolyfill } from "@/polyfills/disposable-stack.ts"
import { installTauriAndroidWebViewLocksPolyfill } from "@/polyfills/tauri-android-webview-locks.ts"

ensureDisposableStackPolyfill()
installTauriAndroidWebViewLocksPolyfill()
