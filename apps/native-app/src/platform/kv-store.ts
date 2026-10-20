import Storage from "expo-sqlite/kv-store"

/** The synchronous key-value store `viewStateAtom` keeps view state in. */
export interface KvStore {
  readonly getItemSync: (key: string) => string | null
  readonly setItemSync: (key: string, value: string) => void
  readonly removeItemSync: (key: string) => void
}

export const kvStore: KvStore = Storage
