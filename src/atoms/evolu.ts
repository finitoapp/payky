import { isNonEmptyArray } from "@evolu/common"
import { atom } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { runAtom } from "@/atoms/run.ts"
import { startCashuShardStore } from "@/core/cashu/cashu-shard-store.ts"
import { createLinkyOwnerSync } from "@/core/cashu/linky-owners.ts"
import { createFetchDep } from "@/core/deps.ts"
import { createAppEvolu } from "@/core/evolu/client.ts"
import { resolveTransportUrl } from "@/core/evolu/device-account.ts"
import { fetchLinkyEvoluRelays } from "@/core/integrations/linky/linky-relays-client.ts"

export const evoluAtom = atom(async (get, { signal }) => {
  const account = await get(accountAtom)
  const run = get(runAtom)
  const evolu = await run.ok(
    createAppEvolu({
      masterKey: account.masterKey,
      transports: [],
    })
  )

  // The stored URLs may carry `${appOwnerId}` for a relay that addresses a
  // room by path. This is the first point where the owner those rows describe
  // actually exists, so it is where the placeholder turns into an id.
  // A demo account never syncs, whatever its transport rows say: its
  // fictional history must not reach a relay (demo-data/0001).
  const transports =
    account.demo === null
      ? account.transports.map((transport) => ({
          ...transport,
          url: resolveTransportUrl(transport.url, evolu.appOwner.id),
        }))
      : []

  const unuse = isNonEmptyArray(transports)
    ? // biome-ignore lint/correctness/useHookAtTopLevel: This is not react hook
      evolu.useOwner(evolu.appOwner, transports)
    : undefined

  // Fires when this atom recomputes (a new client is about to replace this
  // one) or is unmounted — store-owned, unlike a module-level variable, so a
  // second store (tests, HMR) never shares or clobbers this client's cleanup.
  signal.addEventListener(
    "abort",
    () => {
      unuse?.()
      void evolu[Symbol.asyncDispose]()
    },
    { once: true }
  )

  return evolu
})

/**
 * Linky's owners in the app Evolu, next to Payky's own (cashu.md §2): the
 * store that syncs and writes the shared Cashu wallet, or null for a demo
 * account. Released with the app Evolu on an account switch.
 */
export const cashuShardStoreAtom = atom(async (get, { signal }) => {
  const account = await get(accountAtom)
  const evolu = await get(evoluAtom)
  const run = get(runAtom)

  return startCashuShardStore({
    evolu,
    account,
    ownerSync: createLinkyOwnerSync(run.deps.syncState, evolu.name),
    fetchRelays: async () => {
      await using fetchRun = run.create(createFetchDep())
      const relays = await fetchRun(fetchLinkyEvoluRelays)
      if (!relays.ok) return null
      const [first, ...rest] = relays.value
      return first === undefined ? null : [first, ...rest]
    },
    signal,
  })
})
