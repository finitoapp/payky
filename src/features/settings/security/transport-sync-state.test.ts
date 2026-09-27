import {
  createId,
  createIdFromString,
  Millis,
  type OwnerId,
  testAppOwner,
  testCreateDeps,
  testName,
} from "@evolu/common"
import type {
  SyncRoute,
  SyncState,
  SyncTransport,
} from "@evolu/common/local-first"
import { describe, expect, test } from "vitest"

import { findRelaySyncState } from "@/features/settings/security/transport-sync-state.ts"

const deps = testCreateDeps()

const transport: SyncTransport = {
  id: createId<"SyncTransport">(deps),
  label: "wss://relay.example/room",
  readyState: "open",
  openedAt: null,
  closedAt: null,
  error: null,
}

const route: SyncRoute = {
  transportId: transport.id,
  complete: true,
  completeAt: Millis.orThrow(1000),
  lastSentAt: Millis.orThrow(900),
  lastReceivedAt: Millis.orThrow(1000),
  error: null,
}

const stateFor = (ownerId: OwnerId): SyncState => ({
  transports: [transport],
  tenants: [
    {
      name: testName,
      refused: false,
      owners: [
        {
          ownerId,
          writable: true,
          transportIds: [transport.id],
          routes: [route],
        },
      ],
    },
  ],
})

describe("findRelaySyncState", () => {
  test("matches the configured url, ignoring its query", () => {
    const relay = findRelaySyncState(
      stateFor(testAppOwner.id),
      testAppOwner.id,
      "wss://relay.example/room?ownerId=x"
    )

    expect(relay?.status).toBe("synced")
    expect(relay?.transport.id).toBe(transport.id)
  })

  test("ignores another owner's relay and an unknown url", () => {
    const otherOwnerId = createIdFromString<"OwnerId">("other")

    expect(
      findRelaySyncState(
        stateFor(otherOwnerId),
        testAppOwner.id,
        transport.label
      )
    ).toBeNull()
    expect(
      findRelaySyncState(
        stateFor(testAppOwner.id),
        testAppOwner.id,
        "wss://other.example"
      )
    ).toBeNull()
    expect(
      findRelaySyncState(null, testAppOwner.id, transport.label)
    ).toBeNull()
  })
})
