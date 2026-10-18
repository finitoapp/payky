import { loadCashuDefaultMint } from "@payky/core/cashu/cashu-mints"
import { cashuAccountQuery } from "@payky/core/modules/account/account-queries"
import type { AccountId } from "@payky/core/modules/account/account-types"
import { sumAvailableByMint } from "@payky/core/modules/cashu/cashu-queries"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import { cashuShardStoreAtom } from "../../atoms/cashu.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"

/**
 * The account Cashu withdrawals are booked to: the Cashu account, even while
 * Cashu is off, since its ecash stays in the wallet shared with Linky.
 */
export const useCashuAccountId = (): AccountId | undefined =>
  useEvoluQuery(cashuAccountQuery).data[0]?.id

export interface CashuWalletSnapshot {
  readonly defaultMint: MintUrl
  /** Available sats per mint, the shared Linky balance. */
  readonly balances: ReadonlyMap<MintUrl, number>
}

/**
 * The shared wallet's balances and default mint, live; `null` until loaded.
 * Suspends until the account's shard store is up, so call it under a
 * `Suspense` that holds up nothing else. The twin of web's `useCashuWallet`.
 */
export function useCashuWalletSnapshot(): CashuWalletSnapshot | null {
  const store = useAtomValue(cashuShardStoreAtom)
  const [snapshot, setSnapshot] = useState<CashuWalletSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    // Another account's balances must never stand in for this one's.
    setSnapshot(null)
    const load = async () => {
      try {
        const [defaultMint, proofs] = await Promise.all([
          loadCashuDefaultMint(store),
          store.loadProofs(),
        ])
        if (!cancelled)
          setSnapshot({ defaultMint, balances: sumAvailableByMint(proofs) })
      } catch {
        // Keeps the last snapshot; the quote re-reads the balance anyway.
      }
    }
    void load()
    const stopChanges = store.subscribe(() => void load())
    const stopHydration = store.subscribeHydration(() => void load())
    return () => {
      cancelled = true
      stopChanges()
      stopHydration()
    }
  }, [store])

  return snapshot
}
