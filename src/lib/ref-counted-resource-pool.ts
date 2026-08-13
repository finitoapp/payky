export interface RefCountedResourcePoolDeps<TResource, TKey = string> {
  readonly create: (key: TKey) => Promise<TResource>
  readonly destroy: (resource: TResource) => void | Promise<void>
  /**
   * Maps a structured `TKey` to the string used for the internal `Map`
   * lookup. Defaults to `String(key)`, which is the identity for the
   * default `TKey = string`.
   */
  readonly keyOf?: (key: TKey) => string
}

export interface RefCountedResourceLease<TResource> extends AsyncDisposable {
  readonly resource: Promise<TResource>
}

export interface RefCountedResourcePool<TResource, TKey = string> {
  /**
   * Returns the shared resource for `key`, creating it on the first
   * acquisition. The resource is destroyed once every lease acquired for
   * that key has been disposed - disposing one lease never affects another
   * concurrent holder of the same key.
   */
  readonly acquire: (key: TKey) => RefCountedResourceLease<TResource>
}

interface PoolEntry<TResource> {
  readonly resource: Promise<TResource>
  refCount: number
}

export const createRefCountedResourcePool = <TResource, TKey = string>(
  deps: RefCountedResourcePoolDeps<TResource, TKey>
): RefCountedResourcePool<TResource, TKey> => {
  const keyOf = deps.keyOf ?? ((key: TKey) => String(key))
  const entries = new Map<string, PoolEntry<TResource>>()

  const acquire = (key: TKey): RefCountedResourceLease<TResource> => {
    const mapKey = keyOf(key)
    let entry = entries.get(mapKey)

    if (!entry) {
      const resource = deps.create(key)
      entry = { resource, refCount: 0 }
      entries.set(mapKey, entry)

      resource.catch(() => {
        if (entries.get(mapKey) === entry) {
          entries.delete(mapKey)
        }
      })
    }

    const acquiredEntry = entry
    acquiredEntry.refCount += 1

    // AsyncDisposableStack.disposeAsync() is itself idempotent, so it
    // replaces a manual "already released" guard.
    const stack = new AsyncDisposableStack()
    stack.defer(async () => {
      acquiredEntry.refCount -= 1
      if (acquiredEntry.refCount > 0) return
      if (entries.get(mapKey) !== acquiredEntry) return

      entries.delete(mapKey)
      const resource = await acquiredEntry.resource
      await deps.destroy(resource)
    })

    return {
      resource: acquiredEntry.resource,
      [Symbol.asyncDispose]: () => stack.disposeAsync(),
    }
  }

  return { acquire }
}
