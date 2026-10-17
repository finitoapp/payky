import { atom, createStore } from "jotai"
import { expect, test } from "vitest"
import { type AtomLifetime, renewAtomLifetime } from "./atom-lifetime.ts"

const setup = () => {
  const counterAtom = atom(0)
  const lifetimeAtom = atom<AtomLifetime>(() => ({ current: null }))
  const signals: AbortSignal[] = []
  const resourceAtom = atom(async (get, { signal }) => {
    const counter = get(counterAtom)
    signals.push(renewAtomLifetime(get(lifetimeAtom), signal))
    await Promise.resolve()
    return counter
  })
  return { counterAtom, resourceAtom, signals, store: createStore() }
}

test("ends the previous lifetime when a settled atom recomputes", async () => {
  const { counterAtom, resourceAtom, signals, store } = setup()

  expect(await store.get(resourceAtom)).toBe(0)
  store.set(counterAtom, 1)
  expect(await store.get(resourceAtom)).toBe(1)

  expect(signals.map((signal) => signal.aborted)).toEqual([true, false])
})

test("ends a lifetime whose read is superseded while pending", async () => {
  const { counterAtom, resourceAtom, signals, store } = setup()

  void store.get(resourceAtom)
  store.set(counterAtom, 1)
  expect(await store.get(resourceAtom)).toBe(1)

  expect(signals.map((signal) => signal.aborted)).toEqual([true, false])
})

test("keeps each store's lifetimes apart", async () => {
  const { resourceAtom, signals, store } = setup()

  await store.get(resourceAtom)
  await createStore().get(resourceAtom)

  expect(signals.map((signal) => signal.aborted)).toEqual([false, false])
})
