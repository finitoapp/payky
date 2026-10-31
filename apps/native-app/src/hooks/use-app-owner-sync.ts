import type { AppOwnerSyncState } from "@payky/core/deps"
import {
  accountSyncs,
  appOwnerSyncStateOf,
} from "@payky/core/evolu/initial-sync-state"
import { useAtomValue } from "jotai"
import { useSyncExternalStore } from "react"
import { accountAtom } from "../atoms/account.ts"
import { evoluAtom } from "../atoms/evolu.ts"
import { nativeRun } from "../core/native-runtime.ts"

/**
 * What this device knows it holds of the app owner's data, live: complete,
 * still on its way, or blocked by relays it cannot reach (cashu/0013). The
 * same state `AppOwnerSyncDep` answers Tasks with; web's `useAppOwnerSync`.
 */
export function useAppOwnerSync(): AppOwnerSyncState {
  const account = useAtomValue(accountAtom)
  const evolu = useAtomValue(evoluAtom)
  const { syncState } = nativeRun.deps
  const state = useSyncExternalStore(syncState.subscribe, syncState.get)
  return appOwnerSyncStateOf({ state, evolu, syncs: accountSyncs(account) })
}
