/** Holds the abort controller of an atom's current evaluation. */
export interface AtomLifetime {
  current: AbortController | null
}

/**
 * Starts the lifetime of a new evaluation of an atom that owns a resource,
 * ending the previous one. Jotai aborts a getter's `signal` only while the
 * superseded read is still pending: once its promise settled, a recompute
 * (an account switch) aborts nothing, and a resource released on that signal
 * would stay open. The returned signal also ends when this read itself is
 * superseded while pending.
 *
 * Keep `lifetime` in a store-scoped atom (`atom(() => ({ current: null }))`),
 * so a second store never ends this store's resources.
 */
export const renewAtomLifetime = (
  lifetime: AtomLifetime,
  signal: AbortSignal
): AbortSignal => {
  lifetime.current?.abort()
  const controller = new AbortController()
  lifetime.current = controller
  signal.addEventListener("abort", () => controller.abort(), { once: true })
  return controller.signal
}
