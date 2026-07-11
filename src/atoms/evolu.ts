import { isNonEmptyArray } from "@evolu/common"
import { atom } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { runAtom } from "@/atoms/run.ts"
import { createAppEvolu } from "@/core/evolu/client.ts"

let previousEvoluUnuse: (() => unknown) | undefined

export const evoluAtom = atom(async (get) => {
  const account = await get(accountAtom)
  const run = get(runAtom)
  const evolu = await run.orThrow(
    createAppEvolu({
      mnemonic: account.mnemonic,
      transports: [],
    })
  )

  if (previousEvoluUnuse !== undefined) {
    previousEvoluUnuse()
  }

  previousEvoluUnuse = isNonEmptyArray(account.transports)
    ? // biome-ignore lint/correctness/useHookAtTopLevel: This is not react hook
      evolu.useOwner(evolu.appOwner, account.transports)
    : undefined

  const appOwner = evolu.appOwner
  if (appOwner.mnemonic === null || appOwner.mnemonic === undefined)
    throw new Error(
      "App owner mnemonic is not set. Please create a new account."
    )

  return evolu
})
