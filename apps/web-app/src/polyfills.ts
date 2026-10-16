import { installPolyfills } from "@evolu/common/polyfills"
import { installAndroidWebViewLocksPolyfill } from "@/polyfills/android-webview-locks.ts"

installPolyfills()
installAndroidWebViewLocksPolyfill()
