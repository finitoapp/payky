import type { ConnectivityDep, FetchDep } from "@payky/core/deps"
import { addNetworkStateListener } from "expo-network"

// React Native has no CORS, so the plain global fetch is the whole dep, except
// that its aborted-request error is a generic Error. Core recognizes an abort by
// the signal's reason (Evolu's AbortError), so rethrow that instead.
export const createFetchDep = (): FetchDep => ({
  fetch: async (input, init) => {
    try {
      return await globalThis.fetch(input, init)
    } catch (error) {
      if (init?.signal?.aborted) throw init.signal.reason
      throw error
    }
  },
})

/** Fires on a transition to connected and internet-reachable, as the web `online` event; the first reported state is not a transition. */
export const createConnectivityDep = (): ConnectivityDep => ({
  connectivity: {
    onOnline: (listener) => {
      let online: boolean | undefined
      const subscription = addNetworkStateListener((state) => {
        const next =
          state.isConnected === true && state.isInternetReachable === true
        const wasOnline = online
        online = next
        if (next && wasOnline === false) listener()
      })
      return () => subscription.remove()
    },
  },
})
