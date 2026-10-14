import { matchFilter } from "nostr-tools/filter"
import type { Event } from "nostr-tools/pure"

import type { NostrDep } from "@/core/integrations/nostr/nostr-client.ts"

/**
 * A relay pool in memory: queries answer from `stored`, live subscriptions
 * get every event `deliver` adds. Publishing is accepted and dropped.
 */
export const createFakeNostrDep = () => {
  const stored: Event[] = []
  const live: Array<{
    readonly filter: Parameters<typeof matchFilter>[0]
    readonly onevent: (event: Event) => void
    closed: boolean
  }> = []
  const nostr: NostrDep["nostr"] = {
    relays: ["wss://relay.test"],
    pool: {
      get: async () => null,
      publish: (relays) => relays.map(async () => "ok"),
      listConnectionStatus: () => new Map([["wss://relay.test/", true]]),
      subscribeMany: (_relays, filter, params) => {
        const subscription = {
          filter,
          onevent: (event: Event) => params.onevent?.(event),
          closed: false,
        }
        live.push(subscription)
        return {
          close: () => {
            subscription.closed = true
          },
        }
      },
      subscribeManyEose: (_relays, filter, params) => {
        for (const event of stored)
          if (matchFilter(filter, event)) params.onevent?.(event)
        params.onclose?.([])
        return { close: () => undefined }
      },
    },
  }
  return {
    nostr,
    deliver: (event: Event) => {
      stored.push(event)
      for (const subscription of live)
        if (!subscription.closed && matchFilter(subscription.filter, event))
          subscription.onevent(event)
    },
  }
}
