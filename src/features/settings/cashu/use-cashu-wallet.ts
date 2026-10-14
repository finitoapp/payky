import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { cashuShardStoreAtom } from "@/atoms/evolu.ts"
import { loadCashuDefaultMint } from "@/core/cashu/cashu-mints.ts"
import type { CashuShardStore } from "@/core/cashu/cashu-shard-store.ts"
import { sumAvailableByMint } from "@/core/modules/cashu/cashu-queries.ts"
import type { MintUrl } from "@/core/modules/cashu/cashu-types.ts"

export interface CashuWalletSnapshot {
  readonly hydrated: boolean
  readonly defaultMint: MintUrl
  /** Available sats per mint, the shared Linky balance. */
  readonly balances: ReadonlyMap<MintUrl, number>
}

const loadSnapshot = async (
  store: CashuShardStore
): Promise<CashuWalletSnapshot> => ({
  hydrated: store.isHydrated(),
  defaultMint: await loadCashuDefaultMint(store),
  balances: sumAvailableByMint(await store.loadProofs()),
})

/** The shared wallet as the Cashu settings show it, live. */
export const useCashuWallet = () => {
  const store = useAtomValue(cashuShardStoreAtom)
  const query = useQuery({
    queryKey: ["cashuWallet", store.linkyAppOwner.id],
    queryFn: () => loadSnapshot(store),
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

  return { store, snapshot: query.data ?? null }
}
