import { useCallback, useSyncExternalStore } from "react"
import type { z } from "zod"

type Listener = () => void

// One shared listener set per key so every `useLocalStorageState` call site
// reading the same key — even across separate component instances, like a
// header and its page both reading the same preference — observes the same
// value and re-renders together instead of holding its own private copy.
const listenersByKey = new Map<string, Set<Listener>>()

function getListeners(key: string): Set<Listener> {
  let listeners = listenersByKey.get(key)
  if (listeners === undefined) {
    listeners = new Set()
    listenersByKey.set(key, listeners)
  }
  return listeners
}

function notify(key: string) {
  for (const listener of getListeners(key)) listener()
}

function subscribe(key: string, listener: Listener) {
  const listeners = getListeners(key)
  listeners.add(listener)

  // Covers the other-tab case: same-tab writes go through `notify` instead,
  // since the native `storage` event never fires in the writing tab.
  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) listener()
  }
  window.addEventListener("storage", handleStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", handleStorage)
  }
}

function readStoredValue<T>(
  key: string,
  schema: z.ZodType<T>,
  defaultValue: T
): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultValue

    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * Persists a non-critical UI preference in `localStorage` (per
 * AGENTS.md's exception to Evolu-backed storage), validating the stored
 * value against `schema` on read so a stale or corrupted entry falls back to
 * `defaultValue` instead of throwing.
 *
 * Use this — not `deviceSettings` in Evolu — for values that are really
 * view/navigation state (which screen or input mode is currently showing)
 * rather than configuration. Evolu's CRDT log is for values where keeping
 * history/merging concurrent edits matters; a "numpad vs POS" or "list vs
 * scanner" toggle has neither, it's just what's on screen right now, so a
 * synchronous `localStorage` read/write is the simpler and more honest fit.
 *
 * Backed by `useSyncExternalStore` rather than local `useState`: the value
 * lives in `localStorage`, not in this hook, so every call site for the same
 * `key` must observe the same writes — a plain `useState` would give each
 * call site its own private copy that never learns about a write made
 * through another one. Note for future callers: `T` must be a value
 * `Object.is` can compare meaningfully (primitives, or literal unions of
 * them) — the snapshot function returns a freshly parsed value on every
 * call, so an object/array `T` would need memoizing to avoid re-rendering
 * on every read.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  schema: z.ZodType<T>
) {
  const subscribeToKey = useCallback(
    (listener: Listener) => subscribe(key, listener),
    [key]
  )
  const getSnapshot = useCallback(
    () => readStoredValue(key, schema, defaultValue),
    [key, schema, defaultValue]
  )

  const value = useSyncExternalStore(subscribeToKey, getSnapshot)

  const setStoredValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      const previous = readStoredValue(key, schema, defaultValue)
      const resolved = next instanceof Function ? next(previous) : next
      try {
        localStorage.setItem(key, JSON.stringify(resolved))
      } catch {
        // Ignore storage write failures (private browsing, quota, ...).
      }
      notify(key)
    },
    [key, schema, defaultValue]
  )

  return [value, setStoredValue] as const
}
