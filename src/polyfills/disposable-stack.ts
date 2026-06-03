interface ExplicitResourceGlobals {
  readonly AsyncDisposableStack?: unknown
  readonly DisposableStack?: unknown
  readonly SuppressedError?: unknown
}

const explicitResourceGlobals = globalThis as ExplicitResourceGlobals

const hasExplicitResourceManagementSupport =
  typeof explicitResourceGlobals.DisposableStack === "function" &&
  typeof explicitResourceGlobals.AsyncDisposableStack === "function" &&
  typeof explicitResourceGlobals.SuppressedError === "function" &&
  typeof Symbol.dispose === "symbol" &&
  typeof Symbol.asyncDispose === "symbol"

export const ensureDisposableStackPolyfill = async () => {
  if (hasExplicitResourceManagementSupport) {
    return
  }

  await import("core-js/proposals/explicit-resource-management")
}
