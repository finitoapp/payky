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
import { uniqueRelayUrls } from "@/core/linky/nostr-pool.ts"
import {
  fetchNostrProfile,
  type NostrProfile,
} from "@/core/linky/nostr-profile.ts"
import {
  fetchNostrRelayList,
  type NostrRelayList,
} from "@/core/linky/nostr-relay-lists.ts"

/** The account's shared store; suspends until its Evolu client has answered. */
export const useLinkyStore = (): LinkyStoreHandle =>
  useAtomValue(linkyStoreAtom)

/**
 * The account's Nostr identity, kept current as the identity shard syncs: a
 * key switched in any app on this recovery phrase shows up here too.
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

/**
 * The relays every lookup starts from: they hold the relay lists, and a
 * profile is read from and published to them as well as the user's own.
 */
export const bootstrapNostrRelays: ReadonlyArray<string> =
  linkyEnv.VITE_LINKY_NOSTR_RELAYS

export const nostrRelayListQueryKey = (pubkey: string) =>
  ["linky", "relays", pubkey] as const

/** The relay list published under the key; `null` data when none is. */
export const useNostrRelayList = (identity: LinkyIdentity) =>
  useQuery<NostrRelayList | null>({
    queryKey: nostrRelayListQueryKey(identity.pubkey),
    queryFn: ({ signal }) =>
      fetchNostrRelayList({
        pubkey: identity.pubkey,
        relays: bootstrapNostrRelays,
        signal,
      }),
    staleTime: 5 * 60_000,
  })

/**
 * The relays the user's profile is read from and published to: the user's
 * list once it is known, always together with the bootstrap relays.
 */
export const useNostrRelays = (
  identity: LinkyIdentity
): ReadonlyArray<string> => {
  const relayList = useNostrRelayList(identity)
  const published = relayList.data?.relayUrls
  return useMemo(
    () => uniqueRelayUrls([...bootstrapNostrRelays, ...(published ?? [])]),
    [published]
  )
}

export const myNostrProfileQueryKey = (pubkey: string) =>
  ["linky", "profile", pubkey] as const

/**
 * The published kind-0 profile of the identity; empty until one is
 * published. Read from the bootstrap relays at once and again from the
 * user's own relays once their list has arrived.
 */
export const useMyNostrProfile = (identity: LinkyIdentity) => {
  const relays = useNostrRelays(identity)
  return useQuery<NostrProfile>({
    queryKey: [...myNostrProfileQueryKey(identity.pubkey), relays],
    queryFn: ({ signal }) =>
      fetchNostrProfile({ pubkey: identity.pubkey, relays, signal }),
    staleTime: 5 * 60_000,
  })
}
