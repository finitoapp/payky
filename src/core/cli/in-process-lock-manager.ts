/**
 * Minimal Web Locks implementation for single-process runtimes without
 * `navigator.locks`, such as the Bun CLI. Supports exclusive locks and the
 * `ifAvailable` option — the subset Payky background jobs use.
 */
export const createInProcessLockManager = (): LockManager => {
  interface LockChain {
    /** Tail of the exclusive waiter chain; the next request awaits it. */
    readonly tail: Promise<void>
    /** Requests in the chain: the first holds the lock, the rest wait. */
    readonly depth: number
  }

  // One entry per lock name; a name is held or awaited iff it has one.
  const chains = new Map<string, LockChain>()

  const acquire = <T>(
    name: string,
    callback: LockGrantedCallback<T>
  ): Promise<Awaited<T>> => {
    const chain = chains.get(name)
    const previous = chain?.tail ?? Promise.resolve()
    // `then` unwraps a PromiseLike callback result at runtime, which the
    // generic `T` cannot express — hence the cast.
    const result = previous.then(() =>
      callback({ mode: "exclusive", name })
    ) as Promise<Awaited<T>>
    // Release synchronously on settlement — before the caller's continuation
    // runs — so the caller immediately observes the lock as free. Releases run
    // in chain order, so dropping the depth by one per release keeps it equal
    // to the number of requests still in the chain.
    const release = () => {
      const current = chains.get(name)

      if (current === undefined) return
      if (current.tail === tail) {
        chains.delete(name)
        return
      }

      chains.set(name, { ...current, depth: current.depth - 1 })
    }
    const tail: Promise<void> = result.then(release, release)
    chains.set(name, { tail, depth: (chain?.depth ?? 0) + 1 })
    return result
  }

  const toLockInfo = (name: string) => ({
    name,
    mode: "exclusive" as const,
    clientId: "in-process",
  })

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

      if (options.ifAvailable === true && chains.has(name))
        return Promise.resolve(callback(null))

      return acquire(name, callback)
    },
    query: () =>
      Promise.resolve({
        held: [...chains.keys()].map(toLockInfo),
        // One entry per queued waiter. Reporting the whole chain as a single
        // held lock and nothing pending is not what `LockManagerSnapshot`
        // means, and hides exactly the contention a snapshot is read for.
        pending: [...chains.entries()].flatMap(([name, chain]) =>
          Array.from({ length: chain.depth - 1 }, () => toLockInfo(name))
        ),
      }),
  }
}
