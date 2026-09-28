import type { OwnerId } from "@evolu/common"
import {
  type OwnerSyncState,
  type RelaySyncState,
  type SyncState,
  syncStateToOwnerSyncStates,
} from "@evolu/common/local-first"

/**
 * How long a restore waits with no relay actively syncing before it settles
 * on whatever the relays have shown so far. A relay that is still
 * transferring keeps it waiting indefinitely: a first download on a slow link
 * can take minutes, and that is not a failure.
 */
export const initialSyncIdleLimitMs = 20_000

/**
 * - `restored`: the account's settings are present locally.
 * - `empty`: every relay finished syncing and none of them had the settings.
 * - `failed`: the device is offline, or some relay could not be synced with,
 *   so the relays may hold data this device has not seen.
 * - `waiting`: still undecided.
 */
export type InitialSyncOutcome = "waiting" | "restored" | "empty" | "failed"

/** The sync state of `ownerId`, or null before the shared worker reports it. */
export const findOwnerSyncState = (
  state: SyncState | null,
  ownerId: OwnerId
): OwnerSyncState | null => {
  if (state === null) return null
  return (
    syncStateToOwnerSyncStates(state).find(
      (owner) => owner.ownerId === ownerId
    ) ?? null
  )
}

const isRelayFailed = (relay: RelaySyncState): boolean =>
  relay.status === "error" ||
  (relay.status === "offline" && relay.transport.error !== null)

export const evaluateInitialSync = ({
  owner,
  hasSettings,
  online,
  idleForMs,
}: {
  readonly owner: OwnerSyncState | null
  readonly hasSettings: boolean
  readonly online: boolean
  /** Time since a relay of the owner was last seen syncing, or since the start. */
  readonly idleForMs: number
}): InitialSyncOutcome => {
  if (hasSettings) return "restored"
  if (!online) return "failed"

  const relays = owner?.relays ?? []
  if (relays.some((relay) => relay.status === "syncing")) return "waiting"

  const allSynced =
    relays.length > 0 && relays.every((relay) => relay.status === "synced")
  if (allSynced) return "empty"

  const settled =
    relays.length > 0 &&
    relays.every((relay) => relay.status === "synced" || isRelayFailed(relay))
  if (settled || idleForMs >= initialSyncIdleLimitMs) return "failed"

  return "waiting"
}

/**
 * Whether the owner's first sync is still transferring: a relay is syncing and
 * none has ever completed. Until it is false, a missing `appSettings` row
 * says nothing about whether the account has any.
 */
export const isInitialSyncPending = (owner: OwnerSyncState): boolean =>
  owner.syncedAt === null &&
  owner.relays.some((relay) => relay.status === "syncing")
