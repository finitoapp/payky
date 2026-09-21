export interface KeyedTaskQueueDeps {
  readonly onError: (error: unknown) => void
}

export interface KeyedTaskQueue<TKey extends string = string>
  extends AsyncDisposable,
    Disposable {
  readonly enqueue: (key: TKey, work: () => Promise<void>) => void
  readonly isDisposed: boolean
}

export const createKeyedTaskQueue = <TKey extends string = string>(
  deps: KeyedTaskQueueDeps
): KeyedTaskQueue<TKey> => {
  const queue = new Map<TKey, () => Promise<void>>()
  const keyOrder: TKey[] = []
  let running = false
  let disposed = false
  let drain: Promise<void> | undefined

  const dispose = (): void => {
    disposed = true
    queue.clear()
    keyOrder.length = 0
  }

  const startDrain = (): void => {
    if (running) return

    running = true
    drain = (async () => {
      try {
        while (keyOrder.length > 0 && !disposed) {
          const currentKey = keyOrder.shift()
          if (currentKey === undefined) break
          const currentWork = queue.get(currentKey)
          queue.delete(currentKey)
          if (currentWork === undefined) continue
          try {
            await currentWork()
          } catch (error) {
            deps.onError(error)
          }
        }
      } finally {
        running = false
      }
    })()
  }

  const enqueue = (key: TKey, work: () => Promise<void>): void => {
    if (disposed) return

    if (!queue.has(key)) {
      keyOrder.push(key)
    }
    queue.set(key, work)
    startDrain()
  }

  return {
    enqueue,
    get isDisposed() {
      return disposed
    },
    [Symbol.dispose]: dispose,
    async [Symbol.asyncDispose]() {
      dispose()
      await drain
    },
  }
}
