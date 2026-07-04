/**
 * Minimal Web Locks implementation for single-process runtimes without
 * `navigator.locks`, such as the Bun CLI. Supports exclusive locks and the
 * `ifAvailable` option — the subset Payky background jobs use.
 */
export const createInProcessLockManager = (): LockManager => {
  // Tail of the exclusive waiter chain per lock name; a name is held or
  // awaited iff it has an entry.
  const tails = new Map<string, Promise<void>>()

  const acquire = <T>(
    name: string,
    callback: LockGrantedCallback<T>
  ): Promise<Awaited<T>> => {
    const previous = tails.get(name) ?? Promise.resolve()
    // `then` unwraps a PromiseLike callback result at runtime, which the
    // generic `T` cannot express — hence the cast.
    const result = previous.then(() =>
      callback({ mode: "exclusive", name })
    ) as Promise<Awaited<T>>
    // Release synchronously on settlement — before the caller's continuation
    // runs — so the caller immediately observes the lock as free.
    const release = () => {
      if (tails.get(name) === tail) tails.delete(name)
    }
    const tail: Promise<void> = result.then(release, release)
    tails.set(name, tail)
    return result
  }

  return {
    request: <T>(
      name: string,
      optionsOrCallback: LockOptions | LockGrantedCallback<T>,
      maybeCallback?: LockGrantedCallback<T>
    ): Promise<Awaited<T>> => {
      const [options, callback] =
        typeof optionsOrCallback === "function"
          ? [{} satisfies LockOptions, optionsOrCallback]
          : [optionsOrCallback, maybeCallback]

      if (callback === undefined)
        return Promise.reject(
          new TypeError("LockManager.request requires a callback.")
        )
      if (options.mode === "shared" || options.steal === true)
        return Promise.reject(
          new TypeError(
            "In-process lock manager supports only exclusive, non-stolen locks."
          )
        )

      if (options.ifAvailable === true && tails.has(name))
        return Promise.resolve(callback(null))

      return acquire(name, callback)
    },
    query: () =>
      Promise.resolve({
        held: [...tails.keys()].map((name) => ({
          name,
          mode: "exclusive" as const,
          clientId: "in-process",
        })),
        pending: [],
      }),
  }
}
