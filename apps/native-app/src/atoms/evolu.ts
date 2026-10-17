import { createAppEvolu } from "@payky/core/evolu/client"
import { atom } from "jotai"
import { nativeRun } from "../core/native-runtime.ts"
import { accountAtom } from "./account.ts"

export const evoluAtom = atom(async (get, { signal }) => {
  const account = await get(accountAtom)
  // No transports and no useOwner: sync is a later task, nothing reaches a relay.
  const evolu = await nativeRun.ok(
    createAppEvolu({ masterKey: account.masterKey, transports: [] })
  )

  signal.addEventListener(
    "abort",
    () => {
      void evolu[Symbol.asyncDispose]()
    },
    { once: true }
  )

  return evolu
})
