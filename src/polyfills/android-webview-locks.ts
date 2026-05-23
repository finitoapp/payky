import {
  isAndroidWebView,
  isNativeWebViewRuntime,
} from "@/core/native/runtime.ts"

const evoluOneTabSharedWorkerPolyfillLock =
  "evolu-one-tab-sharedworker-polyfill"

const createOneTabLockManager = (nativeLockManager: LockManager) => ({
  request: <T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<T>,
    maybeCallback?: LockGrantedCallback<T>
  ): Promise<Awaited<T>> => {
    const callback =
      typeof optionsOrCallback === "function"
        ? optionsOrCallback
        : maybeCallback

    if (
      name === evoluOneTabSharedWorkerPolyfillLock &&
      typeof optionsOrCallback !== "function" &&
      optionsOrCallback.ifAvailable === true &&
      callback !== undefined
    ) {
      return Promise.resolve(
        callback({
          mode: optionsOrCallback.mode ?? "exclusive",
          name,
        })
      )
    }

    if (typeof optionsOrCallback === "function") {
      return nativeLockManager.request(name, optionsOrCallback)
    }

    if (callback === undefined) {
      return Promise.reject(
        new TypeError("LockManager.request requires a callback.")
      )
    }

    return nativeLockManager.request(name, optionsOrCallback, callback)
  },

  query: () => nativeLockManager.query(),
})

export const installAndroidWebViewLocksPolyfill = () => {
  if (!isNativeWebViewRuntime() || !isAndroidWebView()) return

  const nativeLockManager = globalThis.navigator.locks
  if (nativeLockManager === undefined) return

  Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: createOneTabLockManager(nativeLockManager),
  })
}
