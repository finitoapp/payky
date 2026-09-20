import type { NostrIdentityRow } from "@linky/linksync"
import { useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { useAtomValue } from "jotai"
import { useEffect, useMemo, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { linkyStoreAtom } from "@/atoms/linky-store.ts"
import { linkyEnv } from "@/core/linky/linky-env.ts"
import {
  type LinkyIdentity,
  resolveLinkyIdentity,
} from "@/core/linky/linky-identity.ts"
import type { LinkyStoreHandle } from "@/core/linky/linky-store.ts"
import {
  fetchNostrProfile,
  type NostrProfile,
  type ProfileLang,
} from "@/core/linky/nostr-profile.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { Language } from "@/i18n/resources.ts"

/** The account's Linky store; suspends until its Evolu client has answered. */
export const useLinkyStore = (): LinkyStoreHandle =>
  useAtomValue(linkyStoreAtom)

/**
 * The Nostr identity Linky uses for this account, kept current as the
 * identity shard syncs: a key pasted into Linky shows up here too.
 */
export const useLinkyIdentity = (): LinkyIdentity => {
  const { identity } = useLinkyStore()
  const { masterKey } = useAtomValue(accountAtom)
  const [row, setRow] = useState<NostrIdentityRow | null>(null)

  useEffect(() => {
    let active = true
    const read = () => {
      void Effect.runPromise(identity.current).then((current) => {
        if (active) setRow(current)
      })
    }
    read()
    const unsubscribe = identity.subscribe(read)
    return () => {
      active = false
      unsubscribe()
    }
  }, [identity])

  return useMemo(() => resolveLinkyIdentity(row, masterKey), [row, masterKey])
}

const profileLangs = {
  cs: "cs",
  en: "en",
  // Linky has no Slovak name list; Czech is the closest.
  sk: "cs",
} satisfies Record<Language, ProfileLang>

/** The kind-0 profile of the Linky identity, or Linky's generated defaults. */
export const useMyNostrProfile = (identity: LinkyIdentity) => {
  const { language } = useTranslation()

  return useQuery<NostrProfile>({
    queryKey: ["linky", "profile", identity.pubkey, language],
    queryFn: ({ signal }) =>
      fetchNostrProfile({
        pubkey: identity.pubkey,
        npub: identity.npub,
        relays: linkyEnv.VITE_LINKY_NOSTR_RELAYS,
        lang: profileLangs[language],
        signal,
      }),
    staleTime: 5 * 60_000,
  })
}
