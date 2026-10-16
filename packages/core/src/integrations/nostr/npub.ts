import { decode } from "nostr-tools/nip19"

/**
 * An npub as its hex pubkey, or `null` for anything else. Imports nothing
 * behind the `@/` alias, so the serverless functions can bundle it too.
 */
export const npubToHex = (value: string): string | null => {
  try {
    const decoded = decode(value)
    return decoded.type === "npub" ? decoded.data : null
  } catch {
    return null
  }
}
