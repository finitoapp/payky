import { Effect } from "effect"

import { resolveLinkyIdentity } from "@/core/linky/linky-identity.ts"
import type { LinkyStoreHandle } from "@/core/linky/linky-store.ts"
import { secretKeyFromNsec, uniqueRelayUrls } from "@/core/linky/nostr-pool.ts"
import { fetchNostrRelayList } from "@/core/linky/nostr-relay-lists.ts"
import type { MasterKey } from "@/core/modules/shared/key-derivation.ts"

/** Whose inbox to read, with what, and where it is delivered. */
export interface NostrInboxIdentity {
  readonly pubkey: string
  readonly secretKey: Uint8Array
  /** The bootstrap relays plus the user's published list. */
  readonly relays: ReadonlyArray<string>
}

export interface NostrInboxSource {
  /** The current identity and its relays; opens the shared store on first use. */
  readonly current: () => Promise<NostrInboxIdentity>
  /** Fires when the identity may have changed — a key switched in any app. */
  readonly subscribe: (listener: () => void) => () => void
}

/**
 * `null` where no account exists to read an inbox for — the CLI runs as
 * Evolu's test owner. Jobs treat it as "no inbox".
 */
export type NostrInboxDep = {
  readonly nostrInbox: NostrInboxSource | null
}

/**
 * The account's Nostr identity as the inbox job needs it, resolved the way
 * `useLinkyIdentity` does (the synced identity row first, then NIP-06
 * derivation) but outside React. The relay list is fetched once per public
 * key for the life of the source: the job re-reads the identity, and with it
 * the relays, whenever the identity row changes.
 */
export const createLinkyNostrInboxSource = ({
  openStore,
  masterKey,
  bootstrapRelays,
}: {
  readonly openStore: () => Promise<LinkyStoreHandle>
  readonly masterKey: MasterKey
  readonly bootstrapRelays: ReadonlyArray<string>
}): NostrInboxSource => {
  const relaysByPubkey = new Map<string, Promise<ReadonlyArray<string>>>()

  const relaysFor = (pubkey: string): Promise<ReadonlyArray<string>> => {
    let relays = relaysByPubkey.get(pubkey)
    if (relays === undefined) {
      relays = fetchNostrRelayList({ pubkey, relays: bootstrapRelays }).then(
        (list) =>
          uniqueRelayUrls([...bootstrapRelays, ...(list?.relayUrls ?? [])])
      )
      relaysByPubkey.set(pubkey, relays)
    }
    return relays
  }

  return {
    current: async () => {
      const store = await openStore()
      const row = await Effect.runPromise(store.identity.current)
      const identity = resolveLinkyIdentity(row, masterKey)
      return {
        pubkey: identity.pubkey,
        secretKey: secretKeyFromNsec(identity.nsec),
        relays: await relaysFor(identity.pubkey),
      }
    },
    subscribe: (listener) => {
      let active = true
      let unsubscribe: (() => void) | undefined
      void openStore().then((store) => {
        if (active) unsubscribe = store.identity.subscribe(listener)
      })
      return () => {
        active = false
        unsubscribe?.()
      }
    },
  }
}
