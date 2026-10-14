import { PrivateDirectMessage } from "nostr-tools/kinds"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import { decodeCashuTokenWrap } from "@/core/integrations/nostr/nostr-cashu-inbox.ts"
import {
  deriveNostrSecretKey,
  MasterKey,
} from "@/core/modules/shared/key-derivation.ts"

const payky = deriveNostrSecretKey(
  MasterKey("000102030405060708090a0b0c0d0e0f")
)
const paykyPubkey = getPublicKey(payky)
const customer = generateSecretKey()
const supportMember = getPublicKey(generateSecretKey())

const wrapFrom = (content: string, extraPTags: ReadonlyArray<string> = []) =>
  createWrap(
    createSeal(
      createRumor(
        {
          kind: PrivateDirectMessage,
          created_at: 1_800_000_000,
          content,
          tags: [paykyPubkey, ...extraPTags].map((pubkey) => ["p", pubkey]),
        },
        customer
      ),
      customer,
      paykyPubkey
    ),
    paykyPubkey
  )

const payload = JSON.stringify({
  id: "payment-1",
  mint: "https://cashu.cz",
  unit: "sat",
  proofs: [{ id: "00ad268c4d1f5826", amount: 8, secret: "s", C: "02aa" }],
})

describe("decodeCashuTokenWrap", () => {
  test("takes a NUT-18 payload sent 1:1", () => {
    const message = decodeCashuTokenWrap({
      wrap: wrapFrom(payload),
      secretKey: payky,
    })
    expect(message?.payload).toEqual({
      requestId: "payment-1",
      mint: "https://cashu.cz",
      unit: "sat",
      amount: 8,
    })
    expect(message?.tokenText.startsWith("cashuA")).toBe(true)
    expect(message?.sender).toBe(getPublicKey(customer))
  })

  test("takes a bare token sent 1:1, as Linky sends it", () => {
    const message = decodeCashuTokenWrap({
      wrap: wrapFrom("  cashuBo2FteBhodHRwczovL2NAA "),
      secretKey: payky,
    })
    expect(message).toMatchObject({
      tokenText: "cashuBo2FteBhodHRwczovL2NAA",
      payload: null,
    })
  })

  test("ignores chat text, even one that mentions a token", () => {
    for (const content of ["hello", "here: cashuBo2FteBhodHRwczovL2NAA"])
      expect(
        decodeCashuTokenWrap({ wrap: wrapFrom(content), secretKey: payky })
      ).toBeNull()
  })

  test("ignores a token sent to a group, the support room included", () => {
    expect(
      decodeCashuTokenWrap({
        wrap: wrapFrom(payload, [supportMember]),
        secretKey: payky,
      })
    ).toBeNull()
  })
})
