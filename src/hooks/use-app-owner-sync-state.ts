import { useAtomValue } from "jotai"
import { useSyncExternalStore } from "react"

import { runAtom } from "@/atoms/run.ts"
import {
  findOwnerRelays,
  type OwnerRelays,
} from "@/core/evolu/initial-sync-state.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"

/**
 * The live relays of the app database's owner, from Evolu's shared-worker
 * `syncState`, or null until the worker reports the owner.
 */
export function useAppOwnerSyncState(): OwnerRelays | null {
  const evolu = useEvolu()
  const { syncState } = useAtomValue(runAtom).deps
  const state = useSyncExternalStore(syncState.subscribe, syncState.get)
  return findOwnerRelays(state, evolu.name, evolu.appOwner.id)
}
