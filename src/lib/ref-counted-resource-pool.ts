export interface RefCountedResourcePoolDeps<TResource> {
  readonly create: (key: string) => Promise<TResource>
  readonly destroy: (resource: TResource) => void | Promise<void>
}

export interface RefCountedResourceLease<TResource> extends AsyncDisposable {
  readonly resource: Promise<TResource>
}

export interface RefCountedResourcePool<TResource> {
  /**
   * Returns the shared resource for `key`, creating it on the first
   * acquisition. The resource is destroyed once every lease acquired for
   * that key has been disposed - disposing one lease never affects another
   * concurrent holder of the same key.
   */
  readonly acquire: (key: string) => RefCountedResourceLease<TResource>
}

interface PoolEntry<TResource> {
  readonly resource: Promise<TResource>
  refCount: number
}

export const createRefCountedResourcePool = <TResource>(
  deps: RefCountedResourcePoolDeps<TResource>
): RefCountedResourcePool<TResource> => {
  const entries = new Map<string, PoolEntry<TResource>>()

  const acquire = (key: string): RefCountedResourceLease<TResource> => {
    let entry = entries.get(key)

    if (!entry) {
      const resource = deps.create(key)
      entry = { resource, refCount: 0 }
      entries.set(key, entry)

      resource.catch(() => {
        if (entries.get(key) === entry) {
          entries.delete(key)
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
      if (entries.get(key) !== acquiredEntry) return

      entries.delete(key)
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
