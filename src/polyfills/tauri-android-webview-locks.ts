const evoluOneTabSharedWorkerPolyfillLock =
  "evolu-one-tab-sharedworker-polyfill"

const isAndroidWebView = () => {
  const userAgent = globalThis.navigator.userAgent

  return /Android/i.test(userAgent) && /; wv\)|\bwv\b/i.test(userAgent)
}

const isTauriRuntime = () => {
  const tauriGlobal = globalThis as typeof globalThis & {
    readonly isTauri?: boolean
  }

  return tauriGlobal.isTauri === true
}

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
      callback != null
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

    if (callback == null) {
      return Promise.reject(
        new TypeError("LockManager.request requires a callback.")
      )
    }

    return nativeLockManager.request(name, optionsOrCallback, callback)
  },

  query: () => nativeLockManager.query(),
})

export const installTauriAndroidWebViewLocksPolyfill = () => {
  if (!isTauriRuntime() || !isAndroidWebView()) return

  const nativeLockManager = globalThis.navigator.locks
  if (nativeLockManager == null) return

  Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: createOneTabLockManager(nativeLockManager),
  })
}
