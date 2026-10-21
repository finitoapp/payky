// A nostr relay for the business-name flows (web's mockNostrProfileRelays in
// apps/web-app/e2e/support/nostr-profile.ts): the e2e build lists only it
// (EXPO_PUBLIC_PAYKY_NOSTR_RELAYS, run.ts). Web's spec decides per test
// whether the relay accepts a profile; a flow cannot, so the business name
// does: "Café Skip" is always refused, "Café Retry" only on its account's
// first attempt, any other name accepted. A profile whose content is not the
// trimmed name as both name and display_name is refused too, which is the
// spec's check of the published event.
import type { ServerWebSocket, WebSocketHandler } from "bun"

interface NostrEvent {
  readonly id: string
  readonly pubkey: string
  readonly kind: number
  readonly content: string
}

const accepted = new Map<string, NostrEvent>()
const attempts = new Map<string, number>()

const acceptsProfile = (event: NostrEvent): boolean => {
  const count = (attempts.get(event.pubkey) ?? 0) + 1
  attempts.set(event.pubkey, count)
  let profile: unknown
  try {
    profile = JSON.parse(event.content)
  } catch {
    return false
  }
  if (typeof profile !== "object" || profile === null) return false
  const { name, display_name } = profile as Record<string, unknown>
  if (
    typeof name !== "string" ||
    name.trim() !== name ||
    name === "" ||
    display_name !== name
  )
    return false
  if (name === "Café Skip") return false
  if (name === "Café Retry") return count > 1
  return true
}

const send = (ws: ServerWebSocket<unknown>, message: ReadonlyArray<unknown>) =>
  ws.send(JSON.stringify(message))

export const nostrRelay: WebSocketHandler<unknown> = {
  message(ws, raw) {
    if (typeof raw !== "string") return
    const [type, ...rest] = JSON.parse(raw) as ReadonlyArray<unknown>
    if (type === "REQ") {
      const [subscription, filter] = rest as [
        string,
        { kinds?: ReadonlyArray<number>; authors?: ReadonlyArray<string> },
      ]
      if (filter?.kinds?.includes(0))
        for (const author of filter.authors ?? []) {
          const event = accepted.get(author)
          if (event !== undefined) send(ws, ["EVENT", subscription, event])
        }
      send(ws, ["EOSE", subscription])
    }
    if (type === "EVENT") {
      const event = rest[0] as NostrEvent
      const ok = event.kind !== 0 || acceptsProfile(event)
      if (ok && event.kind === 0) accepted.set(event.pubkey, event)
      send(ws, ["OK", event.id, ok, ok ? "" : "blocked: e2e rejection"])
    }
  },
}
