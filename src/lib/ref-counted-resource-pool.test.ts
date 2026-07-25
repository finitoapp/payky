import { describe, expect, test } from "vitest"

import { createRefCountedResourcePool } from "./ref-counted-resource-pool.ts"

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

interface FakeResource {
  readonly id: number
  readonly key: string
}

const createFakePool = () => {
  const createCalls: string[] = []
  const destroyed: FakeResource[] = []
  let nextId = 0

  const pool = createRefCountedResourcePool<FakeResource>({
    create: async (key) => {
      createCalls.push(key)
      return { id: nextId++, key }
    },
    destroy: (resource) => {
      destroyed.push(resource)
    },
  })

  return { pool, createCalls, destroyed }
}

describe("createRefCountedResourcePool", () => {
  test("creates a resource on first acquisition", async () => {
    const { pool, createCalls } = createFakePool()

    const lease = pool.acquire("a")
    const resource = await lease.resource

    expect(resource.key).toBe("a")
    expect(createCalls).toEqual(["a"])
  })

  test("dedupes concurrent acquisitions for the same key", async () => {
    const { pool, createCalls } = createFakePool()

    const leaseA = pool.acquire("a")
    const leaseB = pool.acquire("a")

    const [resourceA, resourceB] = await Promise.all([
      leaseA.resource,
      leaseB.resource,
    ])

    expect(resourceA).toBe(resourceB)
    expect(createCalls).toEqual(["a"])
  })

  test("creates independent resources for different keys", async () => {
    const { pool, createCalls } = createFakePool()

    const resourceA = await pool.acquire("a").resource
    const resourceB = await pool.acquire("b").resource

    expect(resourceA).not.toBe(resourceB)
    expect(createCalls).toEqual(["a", "b"])
  })

  test("does not destroy the resource while another lease still holds it", async () => {
    const { pool, destroyed } = createFakePool()

    const leaseA = pool.acquire("a")
    const leaseB = pool.acquire("a")
    await leaseA.resource

    await leaseA[Symbol.asyncDispose]()

    expect(destroyed).toEqual([])

    await leaseB[Symbol.asyncDispose]()
    expect(destroyed).toHaveLength(1)
  })

  test("destroys the resource once the last lease is disposed", async () => {
    const { pool, destroyed } = createFakePool()

    const lease = pool.acquire("a")
    const resource = await lease.resource

    await lease[Symbol.asyncDispose]()

    expect(destroyed).toEqual([resource])
  })

  test("works with an await using statement", async () => {
    const { pool, destroyed } = createFakePool()

    {
      await using lease = pool.acquire("a")
      const resource = await lease.resource
      expect(resource.key).toBe("a")
      expect(destroyed).toEqual([])
    }

    expect(destroyed).toHaveLength(1)
  })

  test("disposal is idempotent", async () => {
    const { pool, destroyed } = createFakePool()

    const lease = pool.acquire("a")
    await lease.resource

    await lease[Symbol.asyncDispose]()
    await lease[Symbol.asyncDispose]()
    await lease[Symbol.asyncDispose]()

    expect(destroyed).toHaveLength(1)
  })

  test("disposal order does not matter - only the last one destroys", async () => {
    const { pool, destroyed } = createFakePool()

    const leaseA = pool.acquire("a")
    const leaseB = pool.acquire("a")
    const leaseC = pool.acquire("a")
    await leaseA.resource

    await leaseB[Symbol.asyncDispose]()
    await leaseA[Symbol.asyncDispose]()
    expect(destroyed).toEqual([])

    await leaseC[Symbol.asyncDispose]()
    expect(destroyed).toHaveLength(1)
  })

  test("creates a fresh resource after the pool fully drains", async () => {
    const { pool, createCalls } = createFakePool()

    const lease = pool.acquire("a")
    const resource = await lease.resource
    await lease[Symbol.asyncDispose]()

    const nextResource = await pool.acquire("a").resource

    expect(nextResource).not.toBe(resource)
    expect(createCalls).toEqual(["a", "a"])
  })

  test("removes a failed acquisition so the next acquire retries", async () => {
    const createCalls: string[] = []
    let attempt = 0
    const pool = createRefCountedResourcePool<FakeResource>({
      create: async (key) => {
        createCalls.push(key)
        attempt += 1
        if (attempt === 1) throw new Error("boom")
        return { id: attempt, key }
      },
      destroy: () => {},
    })

    await expect(pool.acquire("a").resource).rejects.toThrow("boom")

    const resource = await pool.acquire("a").resource
    expect(resource.id).toBe(2)
    expect(createCalls).toEqual(["a", "a"])
  })

  test("waits for a pending resource before destroying it", async () => {
    const destroyed: FakeResource[] = []
    const deferred = createDeferred<FakeResource>()
    const pool = createRefCountedResourcePool<FakeResource>({
      create: () => deferred.promise,
      destroy: (resource) => {
        destroyed.push(resource)
      },
    })

    const lease = pool.acquire("a")
    const disposePromise = lease[Symbol.asyncDispose]()

    await delay(0)
    expect(destroyed).toEqual([])

    deferred.resolve({ id: 1, key: "a" })
    await disposePromise

    expect(destroyed).toEqual([{ id: 1, key: "a" }])
  })
})
