import { loadCashuDefaultMint } from "@payky/core/cashu/cashu-mints"
import { sumAvailableByMint } from "@payky/core/modules/cashu/cashu-queries"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { cashuShardStoreAtom } from "../../../atoms/cashu.ts"
import { subscribeToCashuWalletSnapshot } from "./cashu-wallet-snapshot-subscription.ts"

export interface CashuWalletSnapshot {
  readonly hydrated: boolean
  readonly defaultMint: MintUrl
  /** Available sats per mint in the wallet shared with Linky. */
  readonly balances: ReadonlyMap<MintUrl, number>
}

/** Account-scoped aggregate wallet data, refreshed as the shared store changes. */
export function useCashuWalletSnapshot() {
  const store = useAtomValue(cashuShardStoreAtom)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ["cashuWalletSnapshot", store.linkyAppOwner.id],
    queryFn: async (): Promise<CashuWalletSnapshot> => {
      const hydratedBeforeRead = store.isHydrated()
      const [defaultMint, proofs] = await Promise.all([
        loadCashuDefaultMint(store),
        store.loadProofs(),
      ])
      return {
        hydrated: hydratedBeforeRead && store.isHydrated(),
        defaultMint,
        balances: sumAvailableByMint(proofs),
      }
    },
  })
  const { refetch } = query

  useEffect(() => {
    const subscription = subscribeToCashuWalletSnapshot(
      store,
      queryClient,
      ["cashuWalletSnapshot", store.linkyAppOwner.id],
      refetch
    )
    return subscription.dispose
  }, [store, queryClient, refetch])

  return {
    snapshot: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch,
  }
}
