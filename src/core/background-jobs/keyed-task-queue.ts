export interface KeyedTaskQueueDeps {
  readonly onError: (error: unknown) => void
}

export interface KeyedTaskQueue<TKey extends string = string>
  extends Disposable {
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

  const enqueue = (key: TKey, work: () => Promise<void>): void => {
    if (disposed) return

    if (!queue.has(key)) {
      keyOrder.push(key)
    }
    queue.set(key, work)

    const run = async (): Promise<void> => {
      if (running) return

      running = true
      try {
        while (keyOrder.length > 0 && !disposed) {
          const currentKey = keyOrder.shift()
          if (currentKey === undefined) break
          const currentWork = queue.get(currentKey)
          queue.delete(currentKey)
          if (currentWork === undefined) continue
          await currentWork()
        }
      } catch (error) {
        deps.onError(error)
      } finally {
        running = false
      }
    }

    void run()
  }

  return {
    enqueue,
    get isDisposed() {
      return disposed
    },
    [Symbol.dispose]() {
      disposed = true
      queue.clear()
      keyOrder.length = 0
    },
  }
}
