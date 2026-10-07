import type { SubscribeManyParams } from "nostr-tools/abstract-pool"
import { type Filter, matchFilter } from "nostr-tools/filter"
import type { Event } from "nostr-tools/pure"

import type { NostrDep } from "./nostr-client.ts"

/**
 * One in-memory relay behind a fake pool: what is published is stored and
 * pushed to every open subscription it matches, so two parties sharing it
 * talk as they would through a real relay.
 */
export const createFakeNostrRelay = ({
  accepts = () => true,
}: {
  /** Whether the relay stores an event; a refused one is a failed publish. */
  readonly accepts?: (event: Event) => boolean
} = {}) => {
  const stored: Event[] = []
  const subscriptions = new Set<{
    readonly filter: Filter
    readonly params: SubscribeManyParams
  }>()

  const pool: NostrDep["nostr"]["pool"] = {
    get: async () => null,
    publish: (relays, event) =>
      relays.map(async () => {
        if (!accepts(event)) return "connection failure: refused"
        stored.push(event)
        for (const subscription of subscriptions) {
          if (matchFilter(subscription.filter, event)) {
            subscription.params.onevent?.(event)
          }
        }
        return ""
      }),
    listConnectionStatus: () => new Map(),
    subscribeMany: (_relays, filter, params) => {
      const subscription = { filter, params }
      subscriptions.add(subscription)
      for (const event of [...stored]) {
        if (matchFilter(filter, event)) params.onevent?.(event)
      }
      return {
        close: () => {
          subscriptions.delete(subscription)
          params.onclose?.(["closed by caller"])
        },
      }
    },
    subscribeManyEose: (_relays, filter, params) => {
      for (const event of [...stored]) {
        if (matchFilter(filter, event)) params.onevent?.(event)
      }
      params.onclose?.([])
      return { close: () => undefined }
    },
  }

  return {
    nostr: { relays: ["wss://relay.test"], pool },
    stored,
    /** Drops every subscription as a relay going away would. */
    dropSubscriptions: () => {
      for (const subscription of [...subscriptions]) {
        subscriptions.delete(subscription)
        subscription.params.onclose?.(["connection closed"])
      }
    },
  }
}
