import type { QueryKey } from "@tanstack/react-query"

interface CashuWalletSnapshotSubscriptions {
  readonly subscribe: (listener: () => void) => () => void
  readonly subscribeHydration: (listener: () => void) => () => void
}

export function subscribeToCashuWalletSnapshot(
  store: CashuWalletSnapshotSubscriptions,
  queryClient: {
    cancelQueries: (filters: {
      queryKey: QueryKey
      exact: true
    }) => Promise<void>
  },
  queryKey: QueryKey,
  refetch: () => Promise<unknown>,
  subscribeAdditional?: (listener: () => void) => () => void
) {
  let active = true
  let requested = false
  let running: Promise<void> | undefined

  const refresh = () => {
    requested = true
    if (running !== undefined) return running

    let current!: Promise<void>
    current = (async () => {
      try {
        while (active && requested) {
          requested = false
          await queryClient.cancelQueries({ queryKey, exact: true })
          if (active) await refetch()
        }
      } finally {
        if (running === current) {
          running = undefined
          if (active && requested) void refresh()
        }
      }
    })()
    running = current
    return current
  }

  const notify = () => void refresh().catch(() => undefined)
  const stopChanges = store.subscribe(notify)
  const stopHydration = store.subscribeHydration(notify)
  const stopAdditional = subscribeAdditional?.(notify)
  void refresh().catch(() => undefined)

  return {
    refresh,
    dispose: () => {
      active = false
      stopChanges()
      stopHydration()
      stopAdditional?.()
    },
  }
}
