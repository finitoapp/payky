import type { KeyValueStore, KeyValueStoreService } from "@linky/linkshu"
import type { Layer } from "effect"
import { z } from "zod"

import type { LinkshuModules } from "@/core/cashu/cashu-linkshu.ts"

/** The subset of the Web Storage API the store needs; `localStorage` fits. */
export type CashuKeyValueStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>

const LeaseSchema = z.object({
  lease: z.string().min(1),
  expiresAtMs: z.number(),
})

/**
 * `@linky/linkshu`'s `KeyValueStore` over Web Storage.
 *
 * This is deliberately not Evolu: the port holds device-local state only
 * (deterministic counters, their leases, restore cursors, seen keysets), and
 * its lease primitive must claim a key atomically within the tab — Evolu
 * commits asynchronously, so a durable-but-async table cannot give
 * `tryAcquireLease` the read-then-write it needs. Linky's browser adapter
 * makes the same choice. Keys are namespaced per wallet seed, so switching
 * accounts on one device never reuses another seed's counters.
 */
export const createCashuKeyValueStore = (
  { linkshu, effect }: LinkshuModules,
  {
    storage,
    namespace,
  }: {
    readonly storage: CashuKeyValueStorage
    readonly namespace: string
  }
): Layer.Layer<KeyValueStore> => {
  const { Effect, Layer } = effect
  const valuePrefix = `${namespace}.value.`
  const leasePrefix = `${namespace}.lease.`

  const readLease = (key: string) => {
    const raw = storage.getItem(`${leasePrefix}${key}`)
    if (raw === null) return null
    try {
      const parsed = LeaseSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  const storedKeys = (): ReadonlyArray<string> => {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key !== null) keys.push(key)
    }
    return keys
  }

  const service: KeyValueStoreService = {
    get: (key) => Effect.sync(() => storage.getItem(`${valuePrefix}${key}`)),
    set: (key, value) =>
      Effect.sync(() => {
        storage.setItem(`${valuePrefix}${key}`, value)
      }),
    remove: (key) =>
      Effect.sync(() => {
        storage.removeItem(`${valuePrefix}${key}`)
      }),
    listKeys: (prefix) =>
      Effect.sync(() =>
        storedKeys()
          .filter((key) => key.startsWith(`${valuePrefix}${prefix}`))
          .map((key) => key.slice(valuePrefix.length))
      ),
    tryAcquireLease: (key, ttlMs) =>
      Effect.sync(() => {
        const now = Date.now()
        const held = readLease(key)
        if (held !== null && held.expiresAtMs > now) return null

        const lease = linkshu.LeaseId.make(crypto.randomUUID())
        storage.setItem(
          `${leasePrefix}${key}`,
          JSON.stringify({ lease, expiresAtMs: now + ttlMs })
        )
        // Web Storage is shared between tabs without a lock: reading the
        // claim back is what turns two racing writers into one winner.
        return readLease(key)?.lease === lease ? lease : null
      }),
    releaseLease: (key, lease) =>
      Effect.sync(() => {
        if (readLease(key)?.lease === lease) {
          storage.removeItem(`${leasePrefix}${key}`)
        }
      }),
  }

  return Layer.succeed(linkshu.KeyValueStore, service)
}

/** An in-memory `Storage` for tests and runtimes without Web Storage. */
export const createMemoryCashuKeyValueStorage = (): CashuKeyValueStorage => {
  const entries = new Map<string, string>()

  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
  }
}
