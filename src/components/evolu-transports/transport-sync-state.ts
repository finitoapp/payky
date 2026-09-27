import type { OwnerId } from "@evolu/common"
import {
  type RelaySyncState,
  type SyncState,
  syncStateToOwnerSyncStates,
} from "@evolu/common/local-first"

/**
 * Evolu labels a transport by its URL without the query, which carries the
 * owner id, so a configured URL is compared the same way.
 */
const transportLabel = (url: string): string => {
  const queryIndex = url.indexOf("?")
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}

/**
 * The relay state of `url` for `ownerId`, or null while the shared worker has
 * not reported it — before it connects, or right after a transport change
 * reopens the app database.
 */
export const findRelaySyncState = (
  state: SyncState | null,
  ownerId: OwnerId,
  url: string
): RelaySyncState | null => {
  if (state === null) return null

  const label = transportLabel(url)

  for (const owner of syncStateToOwnerSyncStates(state)) {
    if (owner.ownerId !== ownerId) continue
    const relay = owner.relays.find((relay) => relay.transport.label === label)
    if (relay) return relay
  }

  return null
}
