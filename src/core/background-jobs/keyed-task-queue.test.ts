import { describe, expect, test } from "vitest"

import { createKeyedTaskQueue } from "./keyed-task-queue.ts"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createKeyedTaskQueue", () => {
  test("executes enqueued work", async () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    let executed = false

    queue.enqueue("work", async () => {
      executed = true
    })

    await delay(0)
    expect(executed).toBe(true)
  })

  test("executes work sequentially", async () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    const order: string[] = []
    const deferred = createDeferred<void>()

    queue.enqueue("first", async () => {
      order.push("first-start")
      await deferred.promise
      order.push("first-end")
    })

    queue.enqueue("second", async () => {
      order.push("second")
    })

    await delay(0)
    expect(order).toEqual(["first-start"])

    deferred.resolve()
    await delay(0)
    expect(order).toEqual(["first-start", "first-end", "second"])
  })

  test("coalesces work with the same key", async () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    const executions: string[] = []
    const deferred = createDeferred<void>()

    queue.enqueue("work", async () => {
      executions.push("A")
      await deferred.promise
    })

    await delay(0)

    queue.enqueue("work", async () => {
      executions.push("B")
    })
    queue.enqueue("work", async () => {
      executions.push("C")
    })
    queue.enqueue("work", async () => {
      executions.push("D")
    })

    deferred.resolve()
    await delay(0)

    expect(executions).toEqual(["A", "D"])
  })

  test("executes different keys in order", async () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    const executions: string[] = []
    const deferred = createDeferred<void>()

    queue.enqueue("a", async () => {
      executions.push("a")
      await deferred.promise
    })

    await delay(0)

    queue.enqueue("b", async () => {
      executions.push("b")
    })
    queue.enqueue("c", async () => {
      executions.push("c")
    })

    deferred.resolve()
    await delay(0)

    expect(executions).toEqual(["a", "b", "c"])
  })

  test("coalesces by key while preserving order of first occurrence", async () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    const executions: string[] = []
    const deferred = createDeferred<void>()

    queue.enqueue("running", async () => {
      executions.push("running")
      await deferred.promise
    })

    await delay(0)

    queue.enqueue("a", async () => executions.push("a1"))
    queue.enqueue("b", async () => executions.push("b1"))
    queue.enqueue("a", async () => executions.push("a2"))
    queue.enqueue("c", async () => executions.push("c1"))
    queue.enqueue("b", async () => executions.push("b2"))

    deferred.resolve()
    await delay(0)

    expect(executions).toEqual(["running", "a2", "b2", "c1"])
  })

  test("calls onError when work throws", async () => {
    const errors: unknown[] = []
    const queue = createKeyedTaskQueue({ onError: (e) => errors.push(e) })
    const testError = new Error("Test error")

    queue.enqueue("work", async () => {
      throw testError
    })

    await delay(0)
    expect(errors).toEqual([testError])
  })

  test("continues processing after error", async () => {
    const errors: unknown[] = []
    const queue = createKeyedTaskQueue({ onError: (e) => errors.push(e) })
    let secondExecuted = false

    queue.enqueue("first", async () => {
      throw new Error("First error")
    })

    await delay(0)

    queue.enqueue("second", async () => {
      secondExecuted = true
    })

    await delay(0)
    expect(secondExecuted).toBe(true)
  })

  test("isDisposed is false initially", () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    expect(queue.isDisposed).toBe(false)
  })

  test("isDisposed is true after dispose", () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    queue[Symbol.dispose]()
    expect(queue.isDisposed).toBe(true)
  })

  test("works with using statement", async () => {
    let executed = false
    {
      using queue = createKeyedTaskQueue({ onError: () => {} })
      queue.enqueue("work", async () => {
        executed = true
      })
      await delay(0)
    }
    expect(executed).toBe(true)
  })

  test("ignores enqueue after dispose", async () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    let executed = false

    queue[Symbol.dispose]()
    queue.enqueue("work", async () => {
      executed = true
    })

    await delay(0)
    expect(executed).toBe(false)
  })

  test("stops processing queue when disposed during execution", async () => {
    const queue = createKeyedTaskQueue({ onError: () => {} })
    const executions: string[] = []
    const deferred = createDeferred<void>()

    queue.enqueue("first", async () => {
      executions.push("first")
      await deferred.promise
    })

    queue.enqueue("second", async () => {
      executions.push("second")
    })

    await delay(0)
    queue[Symbol.dispose]()
    deferred.resolve()
    await delay(0)

    expect(executions).toEqual(["first"])
  })
})
