import type { AppOwnerSyncState } from "@payky/core/deps"
import {
  accountSyncs,
  findOwnerRelays,
  type OwnerRelays,
  ownerSyncStateOf,
} from "@payky/core/evolu/initial-sync-state"
import { useAtomValue } from "jotai"
import { useSyncExternalStore } from "react"
import { accountAtom } from "@/atoms/account.ts"
import { runAtom } from "@/atoms/run.ts"
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

/**
 * What this device knows it holds of the app owner's data, live: complete,
 * still on its way, or blocked by relays it cannot reach (cashu/0013). The
 * same state `AppOwnerSyncDep` answers Tasks with.
 */
export function useAppOwnerSync(): AppOwnerSyncState {
  const relays = useAppOwnerSyncState()
  const account = useAtomValue(accountAtom)
  return accountSyncs(account) ? ownerSyncStateOf(relays) : { type: "complete" }
}
