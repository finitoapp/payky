import { nprofileEncode, npubEncode } from "nostr-tools/nip19"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import { splitMentions } from "./support-chat-mentions.ts"

const pubkey = getPublicKey(generateSecretKey())
const npub = npubEncode(pubkey)

describe("support chat mentions", () => {
  test("shows the people the bot hands over to as mentions", () => {
    expect(splitMentions(`A colleague will help.\n\nnostr:${npub}`)).toEqual([
      { kind: "text", text: "A colleague will help.\n\n" },
      { kind: "mention", pubkey },
    ])
  })

  test("reads an nprofile mention, as some clients write it", () => {
    const nprofile = nprofileEncode({ pubkey, relays: ["wss://nos.lol"] })
    expect(splitMentions(`ask nostr:${nprofile}, please`)).toEqual([
      { kind: "text", text: "ask " },
      { kind: "mention", pubkey },
      { kind: "text", text: ", please" },
    ])
  })

  test("reads a bare or @-prefixed npub typed by hand", () => {
    expect(splitMentions(`${npub} and @${npub}`)).toEqual([
      { kind: "mention", pubkey },
      { kind: "text", text: " and " },
      { kind: "mention", pubkey },
    ])
  })

  test("leaves an npub inside a link as text", () => {
    const link = `https://njump.me/${npub}`
    expect(splitMentions(link)).toEqual([{ kind: "text", text: link }])
  })

  test("keeps a mention that does not decode as text", () => {
    expect(splitMentions("see nostr:npub1qqqq")).toEqual([
      { kind: "text", text: "see nostr:npub1qqqq" },
    ])
  })
})
