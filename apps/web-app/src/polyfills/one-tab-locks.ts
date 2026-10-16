/// <reference lib="dom" />
// The DOM lib: `vite.config.ts` imports this file too, under a Node-only
// TypeScript project.

/**
 * Lets Evolu's one-tab SharedWorker polyfill run in an Android WebView, whose
 * `navigator.locks` never grants the lock that polyfill asks for with
 * `ifAvailable`: that one request is granted on the spot, everything else
 * goes to the real lock manager.
 *
 * The one copy of this logic. `vite.config.ts` injects it into Evolu's worker
 * chunks as `${installOneTabLocks}`, where there is no module system, so it
 * must stay self-contained: no imports, nothing from the enclosing scope,
 * every constant declared inside. Whether it runs is the caller's question,
 * answered by `isAndroidWebView`, which is injected next to it the same way.
 */
export function installOneTabLocks(): void {
  const nativeLockManager = globalThis.navigator.locks
  if (nativeLockManager === undefined) return

  const oneTabLock = "evolu-one-tab-sharedworker-polyfill"

  Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: {
      request<T>(
        name: string,
        optionsOrCallback: LockOptions | LockGrantedCallback<T>,
        maybeCallback?: LockGrantedCallback<T>
      ): Promise<Awaited<T>> {
        const callback =
          typeof optionsOrCallback === "function"
            ? optionsOrCallback
            : maybeCallback

        if (
          name === oneTabLock &&
          typeof optionsOrCallback !== "function" &&
          optionsOrCallback.ifAvailable === true &&
          callback !== undefined
        ) {
          return Promise.resolve(
            callback({ mode: optionsOrCallback.mode ?? "exclusive", name })
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
    },
  })
}
