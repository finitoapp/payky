import { isNonEmptyArray } from "@evolu/common"
import { atom } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { runAtom } from "@/atoms/run.ts"
import { createAppEvolu } from "@/core/evolu/client.ts"
import { resolveTransportUrl } from "@/core/evolu/device-account.ts"

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
  const transports = account.transports.map((transport) => ({
    ...transport,
    url: resolveTransportUrl(transport.url, evolu.appOwner.id),
  }))

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
