import { wrapEvent } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import { CHAT_RUMOR_KIND, unwrapGiftWrap } from "@/core/linky/nostr-inbox.ts"

describe("unwrapGiftWrap", () => {
  test("opens a wrap addressed to the key and names its sender", async () => {
    const recipientSecretKey = generateSecretKey()
    const senderSecretKey = generateSecretKey()
    const wrap = wrapEvent(
      { kind: CHAT_RUMOR_KIND, content: "cashuBabc", tags: [] },
      senderSecretKey,
      getPublicKey(recipientSecretKey)
    )

    const rumor = await unwrapGiftWrap(wrap, recipientSecretKey)

    expect(rumor).toMatchObject({
      kind: CHAT_RUMOR_KIND,
      content: "cashuBabc",
      pubkey: getPublicKey(senderSecretKey),
    })
  })

  test("yields null for a wrap meant for someone else", async () => {
    const wrap = wrapEvent(
      { kind: CHAT_RUMOR_KIND, content: "hello", tags: [] },
      generateSecretKey(),
      getPublicKey(generateSecretKey())
    )

    expect(await unwrapGiftWrap(wrap, generateSecretKey())).toBeNull()
  })
})
