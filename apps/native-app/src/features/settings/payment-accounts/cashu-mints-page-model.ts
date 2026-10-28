import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { PRODUCTION_MINTS } from "@payky/core/modules/cashu/cashu-utils"

/**
 * The mints screen's sections (cashu/0016), as web's `CashuMintsPage` builds
 * them: the trusted mints in their order (the default first), the mints not
 * trusted that still hold a balance, and the presets in neither.
 */
export function getCashuMintSections(
  trustedMints: ReadonlyArray<MintUrl>,
  balances: ReadonlyMap<MintUrl, number>
) {
  const withBalance = [...balances]
    .filter(([mint, balance]) => balance > 0 && !trustedMints.includes(mint))
    .map(([mint]) => mint)
    .toSorted((a, b) => a.localeCompare(b))
  return {
    trusted: trustedMints,
    withBalance,
    suggested: PRODUCTION_MINTS.filter(
      (mint) => !trustedMints.includes(mint) && !withBalance.includes(mint)
    ),
  }
}
