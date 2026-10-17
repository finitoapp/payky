import {
  type AtomLifetime,
  renewAtomLifetime,
} from "@payky/app-shared/atom-lifetime"
import { createAppEvolu } from "@payky/core/evolu/client"
import { atom } from "jotai"
import { nativeConsole, nativeRun } from "../core/native-runtime.ts"
import { accountAtom } from "./account.ts"

const evoluLifetimeAtom = atom<AtomLifetime>(() => ({ current: null }))

export const evoluAtom = atom(async (get, options) => {
  // Ends the previous account's client as soon as a new one starts opening.
  const signal = renewAtomLifetime(get(evoluLifetimeAtom), options.signal)
  const account = await get(accountAtom)
  // No transports and no useOwner: sync is a later task, nothing reaches a relay.
  const evolu = await nativeRun.ok(
    createAppEvolu({ masterKey: account.masterKey, transports: [] })
  )

  const dispose = () => {
    nativeConsole.debug("Disposing app Evolu.", { accountId: account.id })
    void evolu[Symbol.asyncDispose]()
  }
  if (signal.aborted) dispose()
  else signal.addEventListener("abort", dispose, { once: true })

  return evolu
})
