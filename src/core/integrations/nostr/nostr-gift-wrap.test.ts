import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import { NostrSecretKey } from "@/core/modules/shared/key-derivation.ts"
import {
  createGiftWrap,
  publishGiftWrap,
  subscribeGiftWraps,
  unwrapVerifiedRumor,
} from "./nostr-gift-wrap.ts"
import { createFakeNostrRelay } from "./nostr-test-fixtures.ts"

const sender = NostrSecretKey(new Uint8Array(generateSecretKey()))
const recipient = NostrSecretKey(new Uint8Array(generateSecretKey()))
const now = Math.floor(Date.now() / 1000)

describe("nostr gift wrap", () => {
  test("hands the recipient the rumor its sender sealed", () => {
    const wrap = createGiftWrap({
      kind: 9_059,
      content: "hello",
      tags: [["p", getPublicKey(recipient)]],
      senderSecretKey: sender,
      recipientPubkey: getPublicKey(recipient),
      createdAt: now,
    })

    expect(unwrapVerifiedRumor({ wrap, secretKey: recipient })).toMatchObject({
      kind: 9_059,
      content: "hello",
      pubkey: getPublicKey(sender),
      created_at: now,
    })
    expect(unwrapVerifiedRumor({ wrap, secretKey: sender })).toBeNull()
  })

  test("refuses a rumor whose author is not the seal's signer", () => {
    const forger = generateSecretKey()
    const rumor = createRumor(
      { kind: 9_059, content: "from the owner", tags: [], created_at: now },
      sender
    )
    // The forger seals a rumor that claims someone else wrote it.
    const wrap = createWrap(
      createSeal(rumor, forger, getPublicKey(recipient)),
      getPublicKey(recipient)
    )

    expect(unwrapVerifiedRumor({ wrap, secretKey: recipient })).toBeNull()
  })

  test("publishes to the relays and delivers to a subscription", async () => {
    const relay = createFakeNostrRelay()
    const received: string[] = []
    const unsubscribe = subscribeGiftWraps(relay.nostr, {
      secretKey: recipient,
      sinceSeconds: now - 3 * 24 * 60 * 60,
      onWrap: (wrap) => {
        const rumor = unwrapVerifiedRumor({ wrap, secretKey: recipient })
        if (rumor !== null) received.push(rumor.content)
      },
      onClose: () => undefined,
    })

    const accepted = await publishGiftWrap(
      relay.nostr,
      createGiftWrap({
        kind: 9_059,
        content: "status",
        tags: [],
        senderSecretKey: sender,
        recipientPubkey: getPublicKey(recipient),
        createdAt: now,
      }),
      sender
    )
    unsubscribe()

    expect(accepted).toBe(true)
    expect(received).toEqual(["status"])
  })

  test("reports a publish no relay accepted", async () => {
    const relay = createFakeNostrRelay({ accepts: () => false })

    expect(
      await publishGiftWrap(
        relay.nostr,
        createGiftWrap({
          kind: 9_059,
          content: "status",
          tags: [],
          senderSecretKey: sender,
          recipientPubkey: getPublicKey(recipient),
          createdAt: now,
        }),
        sender
      )
    ).toBe(false)
  })
})
