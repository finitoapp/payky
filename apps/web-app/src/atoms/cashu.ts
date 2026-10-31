import { createCashuMintCache } from "@payky/core/cashu/cashu-mint-cache"
import { createCashuWalletDep } from "@payky/core/cashu/cashu-wallet"
import { deriveCashuWalletSeed } from "@payky/core/modules/shared/key-derivation"
import { atom } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { evoluAtom } from "@/atoms/evolu.ts"
import {
  createE2eCashuMintFetch,
  isE2eCashu,
} from "@/platform/e2e-cashu-mint.ts"
import { createFetchDep } from "@/platform/platform-deps.ts"

/**
 * The account's cashu-ts wallets, one per mint and kept for the session, so
 * every run and the background jobs share loaded keysets (`CashuWalletDep`).
 */
export const cashuWalletDepAtom = atom(async (get) => {
  const account = await get(accountAtom)
  // A demo account reaches no mint (demo-data/0001): it gets the fake one its
  // history was generated against, which signs with the same keys.
  const fetch = isE2eCashu()
    ? await createE2eCashuMintFetch()
    : account.demo === null
      ? createFetchDep().fetch
      : await (async () => {
          const [{ createFakeCashuMint }, { MAIN_MINT_URL }] =
            await Promise.all([
              import("@payky/core/cashu/fake-cashu-mint"),
              import("@payky/core/modules/cashu/cashu-utils"),
            ])
          return createFakeCashuMint({ url: MAIN_MINT_URL }).fetch
        })()
  return createCashuWalletDep({
    seed: deriveCashuWalletSeed(account.masterKey),
    fetch,
    mintCache: createCashuMintCache(await get(evoluAtom)),
  })
})
