import type { OwnerSyncState } from "@evolu/common/local-first"
import { useAtomValue } from "jotai"
import { useSyncExternalStore } from "react"

import { runAtom } from "@/atoms/run.ts"
import { findOwnerSyncState } from "@/core/evolu/initial-sync-state.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"

/**
 * The live sync state of the app database's owner, from Evolu's shared-worker
 * `syncState`, or null until the worker reports it.
 */
export function useAppOwnerSyncState(): OwnerSyncState | null {
  const evolu = useEvolu()
  const { syncState } = useAtomValue(runAtom).deps
  const state = useSyncExternalStore(syncState.subscribe, syncState.get)
  return findOwnerSyncState(state, evolu.appOwner.id)
}
