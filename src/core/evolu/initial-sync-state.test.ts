import {
  createId,
  Millis,
  testAppOwner,
  testCreateDeps,
  testName,
} from "@evolu/common"
import type {
  OwnerSyncState,
  RelaySyncState,
  RelaySyncStatus,
} from "@evolu/common/local-first"
import { describe, expect, test } from "vitest"

import {
  evaluateInitialSync,
  initialSyncIdleLimitMs,
  isInitialSyncPending,
} from "@/core/evolu/initial-sync-state.ts"

const deps = testCreateDeps()

const relay = (
  status: RelaySyncStatus,
  { unreachable = false }: { readonly unreachable?: boolean } = {}
): RelaySyncState => {
  const id = createId<"SyncTransport">(deps)
  const complete = status === "synced"
  return {
    status,
    transport: {
      id,
      label: `wss://${id}.example`,
      readyState: status === "offline" ? "connecting" : "open",
      openedAt: null,
      closedAt: null,
      error: unreachable
        ? { type: "WebSocketConnectError", at: Millis.orThrow(1) }
        : null,
    },
    route: {
      transportId: id,
      complete,
      completeAt: complete ? Millis.orThrow(1000) : null,
      lastSentAt: null,
      lastReceivedAt: null,
      error:
        status === "error"
          ? { type: "ProtocolSyncError", at: Millis.orThrow(1) }
          : null,
    },
  }
}

const owner = (
  relays: ReadonlyArray<RelaySyncState>,
  syncedAt: Millis | null = null
): OwnerSyncState => ({
  name: testName,
  ownerId: testAppOwner.id,
  status: "initial",
  syncedAt,
  error: null,
  relays,
})

const evaluate = (input: Partial<Parameters<typeof evaluateInitialSync>[0]>) =>
  evaluateInitialSync({
    owner: null,
    hasSettings: false,
    online: true,
    idleForMs: 0,
    ...input,
  })

describe("evaluateInitialSync", () => {
  test("local settings win over any relay state", () => {
    expect(evaluate({ hasSettings: true, online: false })).toBe("restored")
  })

  test("fails right away while offline", () => {
    expect(evaluate({ owner: owner([relay("syncing")]), online: false })).toBe(
      "failed"
    )
  })

  test("waits while any relay syncs, however long it takes", () => {
    expect(
      evaluate({
        owner: owner([relay("synced"), relay("syncing")]),
        idleForMs: initialSyncIdleLimitMs * 10,
      })
    ).toBe("waiting")
  })

  test("is empty once every relay synced without settings", () => {
    expect(evaluate({ owner: owner([relay("synced"), relay("synced")]) })).toBe(
      "empty"
    )
  })

  test("fails when a relay failed and the rest synced empty", () => {
    expect(evaluate({ owner: owner([relay("synced"), relay("error")]) })).toBe(
      "failed"
    )
    expect(
      evaluate({
        owner: owner([
          relay("synced"),
          relay("offline", { unreachable: true }),
        ]),
      })
    ).toBe("failed")
  })

  test("waits on a relay still connecting until the idle limit", () => {
    const connecting = owner([relay("synced"), relay("offline")])

    expect(evaluate({ owner: connecting })).toBe("waiting")
    expect(
      evaluate({ owner: connecting, idleForMs: initialSyncIdleLimitMs })
    ).toBe("failed")
    expect(evaluate({ owner: null, idleForMs: initialSyncIdleLimitMs })).toBe(
      "failed"
    )
  })
})

describe("isInitialSyncPending", () => {
  test("is pending while the first sync transfers", () => {
    expect(isInitialSyncPending(owner([relay("syncing")]))).toBe(true)
  })

  test("is settled after a completed sync or with no open relay", () => {
    expect(
      isInitialSyncPending(owner([relay("syncing")], Millis.orThrow(1000)))
    ).toBe(false)
    expect(isInitialSyncPending(owner([relay("offline")]))).toBe(false)
  })
})
