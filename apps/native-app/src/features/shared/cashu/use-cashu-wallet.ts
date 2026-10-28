import {
  cashuBalancesQuery,
  cashuTrustedMintsQuery,
} from "@payky/core/modules/cashu/cashu-queries"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import {
  defaultCashuMintWithout,
  orderTrustedCashuMints,
  pickDefaultCashuMint,
} from "@payky/core/modules/cashu/cashu-utils"
import { useMemo } from "react"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"

export interface CashuWalletSnapshot {
  /** Where payments are quoted, first in the NUT-18 request (cashu/0013). */
  readonly defaultMint: MintUrl
  /** The mints Payky receives from, the default first (cashu/0017). */
  readonly trustedMints: ReadonlyArray<MintUrl>
  /** Available sats per mint. */
  readonly balances: ReadonlyMap<MintUrl, number>
  /** The default once `mint` is untrusted; null for the last trusted mint. */
  readonly defaultWithout: (mint: MintUrl) => MintUrl | null
}

/** Payky's Cashu wallet as the Cashu screens show it, live (web's twin). */
export const useCashuWallet = (): CashuWalletSnapshot => {
  const { data: balanceRows } = useEvoluQuery(cashuBalancesQuery)
  const { data: trustedRows } = useEvoluQuery(cashuTrustedMintsQuery)
  return useMemo(() => {
    const trustedMints = orderTrustedCashuMints(trustedRows)
    return {
      defaultMint: pickDefaultCashuMint(trustedRows).mintUrl,
      trustedMints,
      balances: new Map(
        balanceRows.map((row) => [row.mintUrl, Number(row.balance)])
      ),
      defaultWithout: (mint: MintUrl) =>
        defaultCashuMintWithout(trustedRows, mint),
    }
  }, [balanceRows, trustedRows])
}
