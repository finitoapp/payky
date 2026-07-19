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
      masterKey: account.masterKey,
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

  return evolu
})
