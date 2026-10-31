import {
  type CreateWebSocket,
  createWebSocket,
  type OwnerId,
  spaced,
} from "@evolu/common"
import {
  type SyncRoute,
  type SyncState,
  syncStateToRelaySyncStates,
} from "@evolu/common/local-first"
import type { Evolu } from "../evolu/schema.ts"

/**
 * A `createWebSocket` whose network a test switches off and on, for a device
 * that goes offline and comes back. Off closes every open connection, as a
 * lost network does, and holds every new one connecting, so Evolu neither
 * sends nor gives up; on lets them through. Evolu then reconnects and
 * reconciles whatever piled up on either side. Reconnects wait 10 ms instead
 * of Evolu's growing backoff, so a test that switches often stays fast.
 */
export const createSwitchableWebSocket = () => {
  let online = true
  const sockets = new Set<GatedWebSocket>()

  class GatedWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSING = 2
    readonly CLOSED = 3
    onopen: ((event: Event) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    #binaryType: BinaryType = "blob"
    #real: WebSocket | null = null
    #closed = false
    readonly url: string
    readonly protocols: string | Array<string> | undefined

    constructor(url: string, protocols?: string | Array<string>) {
      this.url = url
      this.protocols = protocols
      sockets.add(this)
      if (online) this.connect()
    }

    get binaryType(): BinaryType {
      return this.#binaryType
    }
    set binaryType(value: BinaryType) {
      this.#binaryType = value
      if (this.#real !== null) this.#real.binaryType = value
    }

    get readyState(): number {
      return this.#closed
        ? GatedWebSocket.CLOSED
        : (this.#real?.readyState ?? GatedWebSocket.CONNECTING)
    }

    connect(): void {
      if (this.#closed || this.#real !== null) return
      const real = new globalThis.WebSocket(this.url, this.protocols)
      real.binaryType = this.#binaryType
      real.onopen = (event) => this.onopen?.(event)
      real.onmessage = (event) => this.onmessage?.(event)
      real.onerror = (event) => this.onerror?.(event)
      real.onclose = (event) => {
        this.#closed = true
        sockets.delete(this)
        this.onclose?.(event)
      }
      this.#real = real
    }

    /** The network went away: the connection drops, as it does in the field. */
    drop(): void {
      this.#real?.close()
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      this.#real?.send(data as never)
    }

    close(): void {
      this.#closed = true
      sockets.delete(this)
      this.#real?.close()
    }
  }

  return {
    createWebSocket: ((url, options) =>
      createWebSocket(url, {
        ...options,
        schedule: spaced("10ms"),
        WebSocketConstructor:
          GatedWebSocket as unknown as typeof globalThis.WebSocket,
      })) satisfies CreateWebSocket as CreateWebSocket,
    get online() {
      return online
    },
    setOnline: (value: boolean): void => {
      if (online === value) return
      online = value
      for (const socket of [...sockets])
        if (value) socket.connect()
        else socket.drop()
    },
  }
}

const ownerRoutes = (
  state: SyncState | null,
  evolu: Evolu,
  ownerId: OwnerId
): ReadonlyArray<SyncRoute> =>
  state === null
    ? []
    : syncStateToRelaySyncStates(state, evolu.name, ownerId).map(
        (relay) => relay.route
      )

/**
 * Asks Evolu for a sync round of the device's app owner and resolves once
 * every one of its routes is `Complete` again after the request: the relay
 * holds every write the device had made, and the device has stored every
 * change the relay held. Driven by the shared worker's sync state, not by a
 * timer; `timeoutMs` only turns a round that never ends into a failure.
 */
export const awaitSyncRound = (
  device: {
    readonly evolu: Evolu
    readonly syncState: {
      readonly get: () => SyncState | null
      readonly subscribe: (listener: () => void) => () => void
    }
  },
  { timeoutMs = 10_000 }: { readonly timeoutMs?: number } = {}
): Promise<void> => {
  const { evolu, syncState } = device
  const ownerId = evolu.appOwner.id
  return new Promise<void>((resolve, reject) => {
    let left = false
    const check = () => {
      const routes = ownerRoutes(syncState.get(), evolu, ownerId)
      if (routes.some((route) => route.type !== "Complete")) left = true
      else if (left && routes.length > 0) done(null)
    }
    const timer = setTimeout(
      () => done(new Error("the sync round did not complete")),
      timeoutMs
    )
    const unsubscribe = syncState.subscribe(check)
    const done = (error: Error | null) => {
      clearTimeout(timer)
      unsubscribe()
      if (error === null) resolve()
      else reject(error)
    }
    evolu.requestSync(ownerId)
    check()
  })
}
