import { decode } from "nostr-tools/nip19"

export type MessagePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "mention"; readonly pubkey: string }

const mentionPattern = /(nostr:|@)?((?:npub1|nprofile1)[02-9ac-hj-np-z]+)/gu

const decodePubkey = (bech32: string): string | null => {
  try {
    const decoded = decode(bech32)
    if (decoded.type === "npub") return decoded.data
    if (decoded.type === "nprofile") return decoded.data.pubkey
  } catch {
    // Not a valid npub or nprofile after all.
  }
  return null
}

/**
 * A message as text and mentions of Nostr accounts, so the chat can show
 * them by name, as other clients do. A mention is a NIP-27 `nostr:npub1…` or
 * `nostr:nprofile1…` — what the support bot writes when it hands over
 * (support/0004) and what Amethyst writes for a picked account — or a bare
 * or `@`-prefixed npub/nprofile typed by hand. A bare one inside a word or a
 * link (`njump.me/npub1…`) is not a mention, and neither is one that does
 * not decode: both stay text.
 */
export const splitMentions = (text: string): ReadonlyArray<MessagePart> => {
  const parts: MessagePart[] = []
  let textStart = 0
  for (const match of text.matchAll(mentionPattern)) {
    const [whole, prefix, bech32 = ""] = match
    const before = text[match.index - 1]
    const pubkey =
      prefix === undefined && before !== undefined && /[\w/:.@-]/u.test(before)
        ? null
        : decodePubkey(bech32)
    if (pubkey === null) continue
    if (match.index > textStart) {
      parts.push({ kind: "text", text: text.slice(textStart, match.index) })
    }
    parts.push({ kind: "mention", pubkey })
    textStart = match.index + whole.length
  }
  if (textStart < text.length) {
    parts.push({ kind: "text", text: text.slice(textStart) })
  }
  return parts
}
