import { isNonEmptyArray } from "@evolu/common"
import {
  type AtomLifetime,
  renewAtomLifetime,
} from "@payky/app-shared/atom-lifetime"
import { createAppEvolu } from "@payky/core/evolu/client"
import { resolveTransportUrl } from "@payky/core/evolu/device-account"
import { atom } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { runAtom } from "@/atoms/run.ts"

const evoluLifetimeAtom = atom<AtomLifetime>(() => ({ current: null }))

export const evoluAtom = atom(async (get, options) => {
  // Ends the previous client as soon as a new account's one starts opening.
  const signal = renewAtomLifetime(get(evoluLifetimeAtom), options.signal)
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
  // one) — store-owned, unlike a module-level variable, so a second store
  // (tests, HMR) never shares or clobbers this client's cleanup.
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
