import type { KvStore } from "./kv-store.ts"

/** Web's `kv-store.ts`: `localStorage`, under the keys web-app already uses. */
export const kvStore: KvStore = {
  getItemSync: (key) => localStorage.getItem(key),
  setItemSync: (key, value) => localStorage.setItem(key, value),
  removeItemSync: (key) => localStorage.removeItem(key),
}
