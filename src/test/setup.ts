import "core-js/proposals/explicit-resource-management"
import "core-js/proposals/promise-try"

type TestLockCallback = (lock: Lock | null) => unknown | PromiseLike<unknown>

interface TestLockRequest {
  readonly name: string
  readonly callback: TestLockCallback
  readonly options: LockOptions
  readonly resolve: (value: unknown) => void
  readonly reject: (reason?: unknown) => void
}

class TestLockManager implements LockManager {
  #held = new Set<string>()
  #pending: TestLockRequest[] = []

  request(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<unknown>,
    maybeCallback?: LockGrantedCallback<unknown>
  ): Promise<unknown> {
    const options =
      typeof optionsOrCallback === "function" ? {} : optionsOrCallback
    const callback =
      typeof optionsOrCallback === "function"
        ? optionsOrCallback
        : maybeCallback

    if (callback === undefined) {
      return Promise.reject(new TypeError("Lock callback is required."))
    }

    if (options.ifAvailable === true && this.#held.has(name)) {
      return Promise.resolve(callback(null))
    }

    return new Promise((resolve, reject) => {
      const request = { name, callback, options, resolve, reject }
      this.#pending.push(request)

      options.signal?.addEventListener(
        "abort",
        () => {
          this.#pending = this.#pending.filter((item) => item !== request)
          reject(options.signal?.reason)
        },
        { once: true }
      )

      this.#drain()
    })
  }

  query(): Promise<LockManagerSnapshot> {
    const held: LockInfo[] = Array.from(this.#held, (name) => ({
      clientId: "test",
      mode: "exclusive" as LockMode,
      name,
    }))
    const pending: LockInfo[] = this.#pending.map((request) => ({
      clientId: "test",
      mode: request.options.mode ?? "exclusive",
      name: request.name,
    }))

    return Promise.resolve({ held, pending })
  }

  #drain(): void {
    for (const request of this.#pending) {
      if (this.#held.has(request.name)) continue

      this.#pending = this.#pending.filter((item) => item !== request)
      this.#held.add(request.name)
      void Promise.resolve(
        request.callback({ mode: "exclusive", name: request.name })
      )
        .then(request.resolve, request.reject)
        .finally(() => {
          this.#held.delete(request.name)
          this.#drain()
        })
      return
    }
  }
}

const navigatorWithLocks = globalThis.navigator as Navigator & {
  locks?: LockManager
}

if (navigatorWithLocks.locks === undefined) {
  Object.defineProperty(globalThis.navigator, "locks", {
    configurable: true,
    value: new TestLockManager(),
  })
}
