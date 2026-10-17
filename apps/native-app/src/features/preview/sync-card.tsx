import { relaySyncStateToStatus } from "@evolu/common/local-first"
import { findOwnerRelays } from "@payky/core/evolu/initial-sync-state"
import { useAtomValue } from "jotai"
import { useSyncExternalStore } from "react"
import { Text, View } from "tamagui"
import { evoluAtom } from "../../atoms/evolu.ts"
import { nativeRun } from "../../core/native-runtime.ts"

/** The active account's relays and their live sync state (diagnostic). */
export function SyncCard() {
  const evolu = useAtomValue(evoluAtom)
  const { syncState } = nativeRun.deps
  const state = useSyncExternalStore(syncState.subscribe, syncState.get)
  const relays = findOwnerRelays(state, evolu.name, evolu.appOwner.id)
  return (
    <View gap="1">
      <Text fontWeight="600">Sync</Text>
      {relays === null ? (
        <Text>No relays reported</Text>
      ) : (
        relays.map((relay) => (
          <Text key={relay.transport.label}>
            {relay.transport.label}: {relaySyncStateToStatus(relay).type}
          </Text>
        ))
      )}
    </View>
  )
}
