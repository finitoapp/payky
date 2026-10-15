import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { cashuShardStoreAtom, cashuWalletDepAtom } from "@/atoms/evolu.ts"
import {
  loadCashuDefaultMint,
  loadKnownCashuMints,
} from "@/core/cashu/cashu-mints.ts"
import type { CashuShardStore } from "@/core/cashu/cashu-shard-store.ts"
import type {
  DeviceAccountId,
  DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import { sumAvailableByMint } from "@/core/modules/cashu/cashu-queries.ts"
import type { MintUrl } from "@/core/modules/cashu/cashu-types.ts"

export interface CashuWalletSnapshot {
  readonly hydrated: boolean
  readonly defaultMint: MintUrl
  /** Available sats per mint, the shared Linky balance. */
  readonly balances: ReadonlyMap<MintUrl, number>
  /** Linky's known mints: named by proofs or operations, or seen or added here. */
  readonly knownMints: ReadonlyArray<MintUrl>
}

const loadSnapshot = async (
  store: CashuShardStore,
  deviceEvolu: DeviceEvolu,
  deviceAccountId: DeviceAccountId
): Promise<CashuWalletSnapshot> => ({
  hydrated: store.isHydrated(),
  defaultMint: await loadCashuDefaultMint(store),
  balances: sumAvailableByMint(await store.loadProofs()),
  knownMints: await loadKnownCashuMints({
    store,
    deviceEvolu,
    deviceAccountId,
  }),
})

/** The shared wallet as the Cashu settings show it, live. */
export const useCashuWallet = () => {
  const store = useAtomValue(cashuShardStoreAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const { deviceAccountId } = useAtomValue(cashuWalletDepAtom).cashuWallet
  const query = useQuery({
    queryKey: ["cashuWallet", store.linkyAppOwner.id],
    queryFn: () => loadSnapshot(store, deviceEvolu, deviceAccountId),
  })
  const { refetch } = query

  useEffect(() => {
    const stopChanges = store.subscribe(() => void refetch())
    const stopHydration = store.subscribeHydration(() => void refetch())
    return () => {
      stopChanges()
      stopHydration()
    }
  }, [store, refetch])

  return { store, snapshot: query.data ?? null, refetch }
}
