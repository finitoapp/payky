import { isNonEmptyArray } from "@evolu/common"
import { atom } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { runAtom } from "@/atoms/run.ts"
import { createAppEvolu } from "@/core/evolu/client.ts"

export const evoluAtom = atom(async (get, { signal }) => {
  const account = await get(accountAtom)
  const run = get(runAtom)
  const evolu = await run.orThrow(
    createAppEvolu({
      masterKey: account.masterKey,
      transports: [],
    })
  )

  const unuse = isNonEmptyArray(account.transports)
    ? // biome-ignore lint/correctness/useHookAtTopLevel: This is not react hook
      evolu.useOwner(evolu.appOwner, account.transports)
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
