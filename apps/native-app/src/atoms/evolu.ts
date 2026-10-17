import { isNonEmptyArray } from "@evolu/common"
import {
  type AtomLifetime,
  renewAtomLifetime,
} from "@payky/app-shared/atom-lifetime"
import { createAppEvolu } from "@payky/core/evolu/client"
import { resolveTransportUrl } from "@payky/core/evolu/device-account"
import { atom } from "jotai"
import { nativeConsole, nativeRun } from "../core/native-runtime.ts"
import { accountAtom } from "./account.ts"

const evoluLifetimeAtom = atom<AtomLifetime>(() => ({ current: null }))

export const evoluAtom = atom(async (get, options) => {
  // Ends the previous account's client as soon as a new one starts opening.
  const signal = renewAtomLifetime(get(evoluLifetimeAtom), options.signal)
  const account = await get(accountAtom)
  const evolu = await nativeRun.ok(
    createAppEvolu({ masterKey: account.masterKey, transports: [] })
  )

  // Stored URLs may carry `${appOwnerId}`; a demo account never syncs.
  const transports =
    account.demo === null
      ? account.transports.map((transport) => ({
          ...transport,
          url: resolveTransportUrl(transport.url, evolu.appOwner.id),
        }))
      : []
  const unuse = isNonEmptyArray(transports)
    ? // biome-ignore lint/correctness/useHookAtTopLevel: This is not a react hook
      evolu.useOwner(evolu.appOwner, transports)
    : undefined

  const dispose = () => {
    nativeConsole.debug("Disposing app Evolu.", { accountId: account.id })
    unuse?.()
    void evolu[Symbol.asyncDispose]()
  }
  if (signal.aborted) dispose()
  else signal.addEventListener("abort", dispose, { once: true })

  return evolu
})
