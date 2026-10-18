import {
  fetchNostrProfile,
  getNostrIdentity,
  type NostrIdentity,
  type NostrProfile,
} from "@payky/core/integrations/nostr/nostr-client"
import { useAtomValue } from "jotai"
import { useMemo } from "react"
import { accountAtom } from "../../../atoms/account.ts"
import { useAppRun } from "../../../hooks/use-app-run.ts"
import { useAsyncValue } from "../../../hooks/use-async-value.ts"

/** The active account's Nostr identity, derived from its recovery phrase. */
export function useNostrIdentity(): NostrIdentity {
  const { masterKey } = useAtomValue(accountAtom)
  return useMemo(() => getNostrIdentity(masterKey), [masterKey])
}

/**
 * The account's published profile; `failed` when no relay answered (an empty
 * profile would let a save overwrite the real one). `attempt` re-reads it.
 */
export function useNostrProfile(pubkey: string, attempt = 0) {
  const appRun = useAppRun()
  return useAsyncValue<NostrProfile>(`${pubkey}:${attempt}`, async () => {
    await using run = appRun()
    const result = await run(fetchNostrProfile({ pubkey }))
    if (!result.ok) throw result.error
    return result.value
  })
}
