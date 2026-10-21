import {
  type AtomLifetime,
  renewAtomLifetime,
} from "@payky/app-shared/atom-lifetime"
import { startCashuShardStore } from "@payky/core/cashu/cashu-shard-store"
import { createCashuWalletDep } from "@payky/core/cashu/cashu-wallet"
import { createLinkyOwnerSync } from "@payky/core/cashu/linky-owners"
import { fetchLinkyEvoluRelays } from "@payky/core/integrations/linky/linky-relays-client"
import { deriveCashuWalletSeed } from "@payky/core/modules/shared/key-derivation"
import { atom } from "jotai"
import { nativeEnv } from "../core/native-env.ts"
import { nativeRun } from "../core/native-runtime.ts"
import { createE2eCashuMintFetch, isE2eCashu } from "../e2e/e2e-cashu-mint.ts"
import { createFetchDep } from "../platform/native-deps.ts"
import { accountAtom } from "./account.ts"
import { evoluAtom } from "./evolu.ts"

const cashuShardStoreLifetimeAtom = atom<AtomLifetime>(() => ({
  current: null,
}))

/**
 * Linky's owners in the app Evolu, next to Payky's own (cashu.md §2): the
 * store that syncs and writes the shared Cashu wallet. A demo account
 * registers no Linky owner and syncs nothing. The previous account's store is
 * released as soon as a new one starts, with its app Evolu (the twin of web's
 * `cashuShardStoreAtom`).
 */
export const cashuShardStoreAtom = atom(async (get, options) => {
  const signal = renewAtomLifetime(
    get(cashuShardStoreLifetimeAtom),
    options.signal
  )
  const account = await get(accountAtom)
  const evolu = await get(evoluAtom)
  const [firstRelay = "wss://evolu.linky.fit", ...otherRelays] =
    nativeEnv.EXPO_PUBLIC_LINKY_EVOLU_RELAYS

  return startCashuShardStore({
    fallbackRelays: [firstRelay, ...otherRelays],
    evolu,
    // An e2e run with the fake mint keeps the wallet local, as a demo does.
    account: isE2eCashu() ? { ...account, demo: "seeded" } : account,
    ownerSync: createLinkyOwnerSync(nativeRun.deps.syncState, evolu.name),
    fetchRelays: async () => {
      await using fetchRun = nativeRun.create(createFetchDep())
      const relays = await fetchRun(
        fetchLinkyEvoluRelays(nativeEnv.EXPO_PUBLIC_LINKY_RELAYS_URL)
      )
      if (!relays.ok) return null
      const [first, ...rest] = relays.value
      return first === undefined ? null : [first, ...rest]
    },
    signal,
  })
})

/**
 * The account's cashu-ts wallets, one per mint and kept for the session, so
 * every run and the background job share loaded keysets (`CashuWalletDep`).
 * A demo account reaches no mint (demo-data/0001): it gets the fake one its
 * history was generated against.
 */
export const cashuWalletDepAtom = atom(async (get) => {
  const account = await get(accountAtom)
  const fetch = isE2eCashu()
    ? await createE2eCashuMintFetch()
    : account.demo === null
      ? createFetchDep().fetch
      : await (async () => {
          const [{ createFakeCashuMint }, { MAIN_MINT_URL }] =
            await Promise.all([
              import("@payky/core/cashu/fake-cashu-mint"),
              import("@payky/core/cashu/cashu-mints"),
            ])
          return createFakeCashuMint({ url: MAIN_MINT_URL }).fetch
        })()
  return createCashuWalletDep({
    seed: deriveCashuWalletSeed(account.masterKey),
    deviceAccountId: account.id,
    fetch,
  })
})
