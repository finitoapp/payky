import type { Page } from "@playwright/test"
import type { Event } from "nostr-tools/pure"

/** A local Nostr relay for onboarding/profile tests; no event reaches a real relay. */
export async function mockNostrProfileRelays(
  page: Page,
  accepts: () => boolean = () => true
) {
  const attempts: Event[] = []
  const accepted = new Map<string, Event>()
  const relayHosts = new Set([
    "relay.damus.io",
    "nos.lol",
    "relay.0xchat.com",
    "nostr.linky.fit",
  ])
  await page.routeWebSocket(
    (url) => relayHosts.has(url.hostname),
    (socket) => {
      socket.onMessage((message) => {
        if (typeof message !== "string") return
        const request = JSON.parse(message) as ReadonlyArray<unknown>
        if (request[0] === "REQ" && typeof request[1] === "string") {
          const filter = request[2] as
            | {
                readonly kinds?: ReadonlyArray<number>
                readonly authors?: ReadonlyArray<string>
              }
            | undefined
          if (filter?.kinds?.includes(0)) {
            for (const author of filter.authors ?? []) {
              const event = accepted.get(author)
              if (event)
                socket.send(JSON.stringify(["EVENT", request[1], event]))
            }
          }
          socket.send(JSON.stringify(["EOSE", request[1]]))
        }
        if (request[0] === "EVENT") {
          const event = request[1] as Event
          if (event.kind !== 0) return
          // Each relay receives the same signed event; expose each publish only once.
          if (!attempts.some(({ id }) => id === event.id)) attempts.push(event)
          const ok = accepts()
          if (ok) accepted.set(event.pubkey, event)
          socket.send(
            JSON.stringify([
              "OK",
              event.id,
              ok,
              ok ? "" : "blocked: test rejection",
            ])
          )
        }
      })
    }
  )
  return { attempts }
}
