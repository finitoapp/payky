import type { Name, OwnerId } from "@evolu/common"
import {
  type RelaySyncState,
  relaySyncStateToStatus,
  type SyncState,
  type SyncStateDep,
  syncStateToRelaySyncStates,
} from "@evolu/common/local-first"
import type { AppOwnerSyncDep, AppOwnerSyncState } from "../deps.ts"

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

/** The relays of one owner in one database, each a transport and its route. */
export type OwnerRelays = ReadonlyArray<RelaySyncState>

/**
 * The relays of `ownerId` in the database `name`, or null while the shared
 * worker has not reported the owner. `syncStateToRelaySyncStates` alone
 * answers an empty list for an owner it does not know yet, which would read
 * as an owner with no relays and end the wait for its first sync.
 */
export const findOwnerRelays = (
  state: SyncState | null,
  name: Name,
  ownerId: OwnerId
): OwnerRelays | null => {
  const registered =
    state?.tenants.some(
      (tenant) =>
        tenant.type === "Active" &&
        tenant.name === name &&
        tenant.owners.some(
          (owner) => owner.type === "Writable" && owner.ownerId === ownerId
        )
    ) === true
  return registered ? syncStateToRelaySyncStates(state, name, ownerId) : null
}

/**
 * Whether the relay is transferring. Only over an open connection: Evolu
 * also calls a first connection still being attempted `Syncing`, but that
 * one counts towards the idle limit, or a host that drops packets would keep
 * a restore waiting until the platform gives up on it.
 */
export const isRelaySyncing = (relay: RelaySyncState): boolean =>
  relaySyncStateToStatus(relay).type === "Syncing" &&
  relay.transport.connection.type === "Open"

const isRelaySynced = (relay: RelaySyncState): boolean =>
  relaySyncStateToStatus(relay).type === "Synced"

const isRelayFailed = (relay: RelaySyncState): boolean => {
  const status = relaySyncStateToStatus(relay).type
  const { connection } = relay.transport
  return (
    status === "Error" ||
    (status === "Offline" &&
      connection.type === "Disconnected" &&
      connection.error !== null)
  )
}

export const evaluateInitialSync = ({
  relays,
  hasSettings,
  online,
  idleForMs,
}: {
  readonly relays: OwnerRelays | null
  readonly hasSettings: boolean
  readonly online: boolean
  /** Time since a relay of the owner was last seen syncing, or since the start. */
  readonly idleForMs: number
}): InitialSyncOutcome => {
  if (hasSettings) return "restored"
  if (!online) return "failed"

  const known = relays ?? []
  if (known.some(isRelaySyncing)) return "waiting"

  const allSynced = known.length > 0 && known.every(isRelaySynced)
  if (allSynced) return "empty"

  const settled =
    known.length > 0 &&
    known.every((relay) => isRelaySynced(relay) || isRelayFailed(relay))
  if (settled || idleForMs >= initialSyncIdleLimitMs) return "failed"

  return "waiting"
}

/**
 * Whether the owner's first sync is still transferring: a relay is syncing and
 * none has ever completed. Until it is false, a missing `appSettings` row
 * says nothing about whether the account has any.
 */
export const isInitialSyncPending = (relays: OwnerRelays): boolean =>
  relays.every((relay) => relay.route.completeAt === null) &&
  relays.some(isRelaySyncing)

/**
 * What this device knows it holds of the owner (cashu/0013): `complete` once
 * every relay has completed a sync since the app started (the worker keeps
 * sync state in memory only), `blocked` when each relay that has not either
 * failed or cannot be reached, else `pending`. Pending too while the worker
 * has not reported the owner; complete for an owner with no relays.
 */
export const ownerSyncStateOf = (
  relays: OwnerRelays | null
): AppOwnerSyncState => {
  if (relays === null) return { type: "pending" }
  const incomplete = relays.filter((relay) => relay.route.completeAt === null)
  if (incomplete.length === 0) return { type: "complete" }
  if (incomplete.every(isRelayFailed))
    return {
      type: "blocked",
      unreachable: incomplete.map((relay) => relay.transport.label),
    }
  return { type: "pending" }
}

/**
 * Whether the account syncs its app database: not a demo account, and one
 * with a transport.
 */
export const accountSyncs = (account: {
  readonly demo: unknown
  readonly transports: ReadonlyArray<unknown>
}): boolean => account.demo === null && account.transports.length > 0

/**
 * The app owner's sync state in the snapshot `state`, for the app database
 * `evolu`. An account that does not sync (a demo account, or one with no
 * transports) is always complete: no other device can hold its data.
 */
export const appOwnerSyncStateOf = ({
  state,
  evolu,
  syncs,
}: {
  readonly state: SyncState | null
  readonly evolu: {
    readonly name: Name
    readonly appOwner: { readonly id: OwnerId }
  }
  readonly syncs: boolean
}): AppOwnerSyncState =>
  syncs
    ? ownerSyncStateOf(findOwnerRelays(state, evolu.name, evolu.appOwner.id))
    : { type: "complete" }

/** `AppOwnerSyncDep` over Evolu's live sync state, for the app database. */
export const createAppOwnerSyncDep = ({
  syncState,
  evolu,
  syncs,
}: SyncStateDep & {
  readonly evolu: {
    readonly name: Name
    readonly appOwner: { readonly id: OwnerId }
  }
  readonly syncs: boolean
}): AppOwnerSyncDep => ({
  appOwnerSync: {
    state: () => appOwnerSyncStateOf({ state: syncState.get(), evolu, syncs }),
  },
})
