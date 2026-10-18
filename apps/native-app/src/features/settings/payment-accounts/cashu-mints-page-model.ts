import { PRODUCTION_MINTS } from "@payky/core/cashu/cashu-mints"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"

export function getCashuMintSections(
  defaultMint: MintUrl | null,
  knownMints: ReadonlyArray<MintUrl>
) {
  const known = [
    ...new Set([...(defaultMint === null ? [] : [defaultMint]), ...knownMints]),
  ]
  return {
    known,
    suggested: PRODUCTION_MINTS.filter((mint) => !known.includes(mint)),
  }
}
