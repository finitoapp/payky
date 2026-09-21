import type { Event } from "nostr-tools/pure"
import { finalizeEvent } from "nostr-tools/pure"

import {
  publishToRelays,
  secretKeyFromNsec,
  uniqueRelayUrls,
  withRelays,
} from "@/core/linky/nostr-pool.ts"

/** NIP-65: the relays a user reads from and writes to. */
const RELAY_LIST_KIND = 10002
/** NIP-17: where private messages for the user are delivered. */
const DM_RELAY_LIST_KIND = 10050

/** The relay list a user published, with the event's timestamp. */
export interface NostrRelayList {
  readonly relayUrls: ReadonlyArray<string>
  readonly updatedAt: number
}

const tagNameOf = {
  [RELAY_LIST_KIND]: "r",
  [DM_RELAY_LIST_KIND]: "relay",
} as const

const isRelayListKind = (
  kind: number
): kind is typeof RELAY_LIST_KIND | typeof DM_RELAY_LIST_KIND =>
  kind === RELAY_LIST_KIND || kind === DM_RELAY_LIST_KIND

/** The relay URLs a kind 10002 or 10050 event lists; `null` for other kinds. */
export const parseRelayListEvent = (
  event: Pick<Event, "kind" | "tags">
): ReadonlyArray<string> | null => {
  if (!isRelayListKind(event.kind)) return null
  const tagName = tagNameOf[event.kind]
  return uniqueRelayUrls(
    event.tags.flatMap((tag) =>
      tag[0] === tagName && tag[1] !== undefined ? [tag[1]] : []
    )
  )
}

const newest = (events: ReadonlyArray<Event>): Event | null =>
  events.reduce<Event | null>(
    (best, event) =>
      best === null || event.created_at > best.created_at ? event : best,
    null
  )

/**
 * The list to show: the newest NIP-65 event when one exists, else the newest
 * DM relay list — the same preference the other apps on this key apply, so
 * every app resolves the same relays from the same events.
 */
export const pickRelayList = (
  events: ReadonlyArray<Event>
): NostrRelayList | null => {
  const relayList =
    newest(events.filter((event) => event.kind === RELAY_LIST_KIND)) ??
    newest(events.filter((event) => event.kind === DM_RELAY_LIST_KIND))
  if (relayList === null) return null
  const relayUrls = parseRelayListEvent(relayList)
  if (relayUrls === null || relayUrls.length === 0) return null
  return { relayUrls, updatedAt: relayList.created_at }
}

/** The relay list `pubkey` published on any of `relays`, or `null`. */
export const fetchNostrRelayList = async ({
  pubkey,
  relays,
  signal,
}: {
  readonly pubkey: string
  readonly relays: ReadonlyArray<string>
  readonly signal?: AbortSignal
}): Promise<NostrRelayList | null> => {
  try {
    return await withRelays(relays, async (pool) => {
      const events = await pool.querySync(
        [...relays],
        { kinds: [RELAY_LIST_KIND, DM_RELAY_LIST_KIND], authors: [pubkey] },
        { maxWait: 6_000 }
      )
      if (signal?.aborted) return null
      return pickRelayList(events)
    })
  } catch {
    return null
  }
}

/**
 * Publishes `relayUrls` as both the NIP-65 relay list and the NIP-17 DM relay
 * list, to `relays` and to the listed relays themselves; resolves once at
 * least one relay accepted each event.
 */
export const publishNostrRelayList = async ({
  nsec,
  relays,
  relayUrls,
}: {
  readonly nsec: string
  readonly relays: ReadonlyArray<string>
  readonly relayUrls: ReadonlyArray<string>
}): Promise<NostrRelayList> => {
  const secretKey = secretKeyFromNsec(nsec)
  const createdAt = Math.floor(Date.now() / 1000)
  const urls = uniqueRelayUrls(relayUrls)
  const targets = uniqueRelayUrls([...relays, ...urls])
  const eventOf = (kind: keyof typeof tagNameOf) =>
    finalizeEvent(
      {
        kind,
        created_at: createdAt,
        tags: urls.map((url) => [tagNameOf[kind], url]),
        content: "",
      },
      secretKey
    )

  await withRelays(targets, async (pool) => {
    await publishToRelays(
      pool,
      targets,
      eventOf(RELAY_LIST_KIND),
      "No relay accepted the relay list."
    )
    await publishToRelays(
      pool,
      targets,
      eventOf(DM_RELAY_LIST_KIND),
      "No relay accepted the DM relay list."
    )
  })

  return { relayUrls: urls, updatedAt: createdAt }
}
