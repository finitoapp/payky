import {
  type AppOwner,
  createAppOwner,
  createOwnerWebSocketTransport,
  deriveShardOwner,
  type Name,
  type NonEmptyReadonlyArray,
  type OwnerId,
  type OwnerTransport,
  type ShardOwner,
} from "@evolu/common"

import type { SyncStateDep } from "@evolu/common/local-first"
import { findOwnerRelays } from "../evolu/initial-sync-state.ts"
import { cashuShardScope } from "../modules/cashu/cashu-types.ts"
import {
  deriveLinkyAppOwnerSecret,
  type MasterKey,
} from "../modules/shared/key-derivation.ts"
import type { LinkyOwnerSync } from "./cashu-shard-store.ts"

/**
 * Linky's identities, derived from the master key next to Payky's own owner
 * (cashu.md §1–2). Linky's app owner holds `shardPointer` and `setting`; its
 * cashu shard owners hold the shared wallet.
 */
export const deriveLinkyAppOwner = (masterKey: MasterKey): AppOwner =>
  createAppOwner(deriveLinkyAppOwnerSecret(masterKey))

/** `deriveShardOwner(linkyAppOwner, ["cashu", index])`, as Linky's shard store derives it. */
export const deriveCashuShardOwner = (
  linkyAppOwner: AppOwner,
  index: number
): ShardOwner => deriveShardOwner(linkyAppOwner, [cashuShardScope, index])

/**
 * One transport per relay for one Linky owner. The app Evolu is created
 * without transports, and Payky's own relay rows address its own owner, so
 * every Linky owner gets explicit ones.
 */
export const linkyOwnerTransports = (
  ownerId: OwnerId,
  relays: NonEmptyReadonlyArray<string>
): NonEmptyReadonlyArray<OwnerTransport> => {
  const [first, ...rest] = relays
  return [
    createOwnerWebSocketTransport({ url: first, ownerId }),
    ...rest.map((url) => createOwnerWebSocketTransport({ url, ownerId })),
  ]
}

/**
 * An owner counts as synced once one of its relays completed a sync round
 * since the shared worker started (Linky's `ownerSync`, from Evolu's
 * `syncState` here instead of a worker message).
 */
export const createLinkyOwnerSync = (
  syncState: SyncStateDep["syncState"],
  name: Name
): LinkyOwnerSync => ({
  isOwnerSynced: (ownerId) =>
    findOwnerRelays(syncState.get(), name, ownerId)?.some(
      (relay) => relay.route.completeAt !== null
    ) ?? false,
  subscribe: (listener) => syncState.subscribe(listener),
})
