import { expect, test, vi } from "vitest"

const network = vi.hoisted(() => ({
  emit: (_state: { isConnected: boolean; isInternetReachable: boolean }) => {},
  removed: 0,
}))

vi.mock("expo-network", () => ({
  addNetworkStateListener: (cb: typeof network.emit) => {
    network.emit = cb
    return { remove: () => network.removed++ }
  },
}))

import { createConnectivityDep } from "./native-deps.ts"

test("fires on offline to online only, not for the first state, and unsubscribe removes the listener", () => {
  const listener = vi.fn()
  const off = createConnectivityDep().connectivity.onOnline(listener)
  const up = { isConnected: true, isInternetReachable: true }
  network.emit(up)
  expect(listener).not.toHaveBeenCalled()
  network.emit({ isConnected: false, isInternetReachable: false })
  expect(listener).not.toHaveBeenCalled()
  network.emit(up)
  expect(listener).toHaveBeenCalledTimes(1)
  network.emit(up)
  expect(listener).toHaveBeenCalledTimes(1)
  network.emit({ isConnected: true, isInternetReachable: false })
  network.emit(up)
  expect(listener).toHaveBeenCalledTimes(2)
  off()
  expect(network.removed).toBe(1)
})
