import { QueryClient } from "@tanstack/react-query"
import { expect, it, vi } from "vitest"
import { subscribeToCashuWalletSnapshot } from "./cashu-wallet-snapshot-subscription.ts"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it("does not lose store changes while a wallet snapshot read is pending", async () => {
  const queryClient = new QueryClient()
  const queryKey = ["cashuWalletSnapshot", "owner"]
  const changes = new Set<() => void>()
  const hydration = new Set<() => void>()
  const [firstRead, secondRead, thirdRead] = [
    deferred<number>(),
    deferred<number>(),
    deferred<number>(),
  ]
  const reads = [firstRead, secondRead, thirdRead]
  let readIndex = 0
  const read = () => {
    const current = reads[readIndex]
    readIndex += 1
    if (current === undefined)
      throw new Error("Unexpected wallet snapshot read")
    return current.promise
  }
  const store = {
    subscribe: (listener: () => void) => {
      changes.add(listener)
      return () => changes.delete(listener)
    },
    subscribeHydration: (listener: () => void) => {
      hydration.add(listener)
      return () => hydration.delete(listener)
    },
  }
  const fetchSnapshot = () =>
    queryClient.fetchQuery({ queryKey, queryFn: read, staleTime: 0 })

  const initialRead = fetchSnapshot().catch(() => undefined)
  const subscription = subscribeToCashuWalletSnapshot(
    store,
    queryClient,
    queryKey,
    async () => {
      await fetchSnapshot()
    }
  )

  await vi.waitFor(() => expect(readIndex).toBe(2))
  for (const listener of changes) listener()
  secondRead.resolve(1)
  await vi.waitFor(() => expect(readIndex).toBe(3))
  thirdRead.resolve(2)
  await vi.waitFor(() => expect(queryClient.getQueryData(queryKey)).toBe(2))

  expect(queryClient.getQueryData(queryKey)).toBe(2)
  firstRead.resolve(0)
  await initialRead
  expect(queryClient.getQueryData(queryKey)).toBe(2)

  subscription.dispose()
  expect(changes.size).toBe(0)
  expect(hydration.size).toBe(0)
  queryClient.clear()
})
