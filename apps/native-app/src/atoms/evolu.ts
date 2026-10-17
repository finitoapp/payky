import { createAppEvolu } from "@payky/core/evolu/client"
import { atom } from "jotai"
import { nativeConsole, nativeRun } from "../core/native-runtime.ts"
import { accountAtom } from "./account.ts"

let dispose: (() => void) | null = null

export const evoluAtom = atom(async (get, { signal }) => {
  const account = await get(accountAtom)
  // Jotai aborts `signal` only for a read superseded while still pending, not
  // for a settled value a dependency replaces; so the previous account's
  // client is disposed here, explicitly, before the new one opens.
  dispose?.()
  // No transports and no useOwner: sync is a later task, nothing reaches a relay.
  const evolu = await nativeRun.ok(
    createAppEvolu({ masterKey: account.masterKey, transports: [] })
  )

  let disposed = false
  const disposeOnce = () => {
    if (disposed) return
    disposed = true
    nativeConsole.debug("Disposing app Evolu.", { accountId: account.id })
    void evolu[Symbol.asyncDispose]()
  }
  dispose = disposeOnce
  // A read superseded while still opening must not leak its client.
  signal.addEventListener("abort", disposeOnce, { once: true })

  return evolu
})
