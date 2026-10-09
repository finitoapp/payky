import type { LocalStorageDep } from "@/core/deps.ts"

/** An in-memory stand-in for `localStorage`, seeded with `entries`. */
export const createTestLocalStorage = (
  entries: Readonly<Record<string, string>> = {}
): LocalStorageDep["localStorage"] & Pick<Storage, "setItem"> => {
  const values = new Map(Object.entries(entries))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}
