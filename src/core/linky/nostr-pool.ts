import { decode } from "nostr-tools/nip19"

/** `wss://` or `ws://`, and parseable — what a relay list entry may hold. */
export const isRelayUrl = (value: string): boolean =>
  normalizeRelayUrl(value) !== null

/**
 * The relay URL as it is compared and stored: trimmed, scheme and host in
 * lower case, and without the trailing slash `URL` adds to a bare origin.
 * `null` for anything that is not a websocket URL.
 */
export const normalizeRelayUrl = (value: string): string | null => {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== "wss:" && url.protocol !== "ws:") return null
  const text = url.toString()
  const bareOrigin =
    url.pathname === "/" && url.search === "" && url.hash === ""
  return bareOrigin && text.endsWith("/") ? text.slice(0, -1) : text
}

/** Valid relay URLs, normalized, first occurrence kept. */
export const uniqueRelayUrls = (
  values: ReadonlyArray<string>
): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const normalized = normalizeRelayUrl(value)
    if (normalized === null || seen.has(normalized)) continue
    seen.add(normalized)
    unique.push(normalized)
  }
  return unique
}

export class NostrPublishError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NostrPublishError"
  }
}

export const secretKeyFromNsec = (nsec: string): Uint8Array => {
  const decoded = decode(nsec.trim())
  if (decoded.type !== "nsec") {
    throw new NostrPublishError("The active key is not an nsec.")
  }
  return decoded.data
}

type Pool = InstanceType<typeof import("nostr-tools/pool").SimplePool>

/** A pool for one call, closed afterwards; nostr-tools loads on first use. */
export const withRelays = async <T>(
  relays: ReadonlyArray<string>,
  use: (pool: Pool) => Promise<T>
): Promise<T> => {
  const { SimplePool } = await import("nostr-tools/pool")
  const pool = new SimplePool()
  try {
    return await use(pool)
  } finally {
    pool.close([...relays])
  }
}

/** Publishes `event` and resolves once at least one relay accepted it. */
export const publishToRelays = async (
  pool: Pool,
  relays: ReadonlyArray<string>,
  event: import("nostr-tools/pure").Event,
  failureMessage: string
): Promise<void> => {
  try {
    await Promise.any(pool.publish([...relays], event))
  } catch {
    throw new NostrPublishError(failureMessage)
  }
}
