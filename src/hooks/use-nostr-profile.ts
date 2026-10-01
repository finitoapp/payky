import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useMemo } from "react"

import { accountAtom } from "@/atoms/account.ts"
import {
  fetchNostrProfile,
  getNostrIdentity,
  type NostrIdentity,
} from "@/core/integrations/nostr/nostr-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"

/** The account's Nostr identity, derived from its recovery phrase. */
export const useNostrIdentity = (): NostrIdentity => {
  const { masterKey } = useAtomValue(accountAtom)
  return useMemo(() => getNostrIdentity(masterKey), [masterKey])
}

export const nostrProfileQueryKey = (pubkey: string) =>
  ["nostr", "profile", pubkey] as const

/** The account's published kind-0 profile; errors when no relay answered. */
export const useNostrProfile = (pubkey: string) => {
  const appRun = useAppRun()
  return useQuery({
    queryKey: nostrProfileQueryKey(pubkey),
    queryFn: async () => {
      await using run = appRun()
      const result = await run(fetchNostrProfile({ pubkey }))
      if (!result.ok) throw result.error
      return result.value
    },
    staleTime: 5 * 60_000,
  })
}
