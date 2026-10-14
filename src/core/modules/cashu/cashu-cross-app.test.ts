import { describe, expect, test } from "vitest"

import {
  cashuOperationIdFor,
  cashuProofIdFor,
  linkySettingIdFor,
  normalizeMintUrl,
  operationKeyOf,
  shardPointerIdFor,
} from "@/core/modules/cashu/cashu-utils.ts"

/**
 * Cross-app Cashu vectors shared between Linky and Payky.
 *
 * The identical vector tables live in both repos:
 *   linky: apps/web-app/src/paykyCashuCrossApp.test.ts
 *   payky: src/core/modules/cashu/cashu-cross-app.test.ts
 *
 * Both apps write one wallet (cashu.md, decision 1): its rows are keyed by
 * these ids and mint URLs, so a mismatch forks the wallet or makes Linky skip
 * Payky's rows. If a change here is intentional, update BOTH copies.
 */

const MINT_URL_VECTORS: ReadonlyArray<
  readonly [input: string, normalized: string | null]
> = [
  ["https://cashu.cz", "https://cashu.cz"],
  [" https://cashu.cz/ ", "https://cashu.cz"],
  ["https://cashu.cz///", "https://cashu.cz"],
  ["https://mint.minibits.cash", "https://mint.minibits.cash/Bitcoin"],
  ["https://MINT.minibits.cash/Bitcoin/", "https://mint.minibits.cash/Bitcoin"],
  [
    "https://mint.minibits.cash/Bitcoin?x=1",
    "https://mint.minibits.cash/Bitcoin",
  ],
  ["https://mint.example.com/path/?a=1#x", "https://mint.example.com/path"],
  ["HTTPS://Cashu.CZ", "https://cashu.cz"],
  ["http://localhost:3338/", "http://localhost:3338"],
  ["https://kashu.me/sub/path//", "https://kashu.me/sub/path"],
  ["https://user:pw@mint.example.com/", "https://mint.example.com"],
  ["cashu.cz", null],
  ["", null],
  ["ftp://x.y", null],
]

const OPERATION_KEY_VECTORS: ReadonlyArray<{
  readonly operation: {
    readonly kind: "topup" | "receive" | "melt"
    readonly mint: string
    readonly quoteId: string | null
    readonly tokenText: string | null
  }
  readonly key: string
  readonly id: string
}> = [
  {
    operation: {
      kind: "topup",
      mint: "https://cashu.cz",
      quoteId: "q1",
      tokenText: null,
    },
    key: "topup|https://cashu.cz|q1",
    id: "BGlgDe11qmFny9YMFDFEMA",
  },
  {
    operation: {
      kind: "receive",
      mint: "https://cashu.cz",
      quoteId: null,
      tokenText: "cashuBabc",
    },
    key: "receive|cashuBabc",
    id: "Jp7BJO58G7fLgNCYxFZ5vw",
  },
  {
    operation: {
      kind: "melt",
      mint: "https://cashu.cz",
      quoteId: null,
      tokenText: null,
    },
    key: "melt|https://cashu.cz|",
    id: "SyizwpKPhVHxry_Apy878A",
  },
  {
    operation: {
      kind: "melt",
      mint: "https://cashu.cz",
      quoteId: "m1",
      tokenText: "cashuBenv",
    },
    key: "melt|https://cashu.cz|m1",
    id: "v8OkMn4X0n6QC4aCZBJqWQ",
  },
]

const PROOF_ID_VECTOR = {
  secret: "407915bc212be61a77e3e6d2aeb4c727980bda51cd06a6afc29e2861768a7837",
  id: "BZPKWM_sfeFRihXDyPbdLw",
}

/** `createIdFromString` of the meta rows, as Linky's `shardPointerId`/`settingIdFor`. */
const META_ROW_ID_VECTORS = {
  cashuShardPointer: "w3pAg-Ph4dKu9GiB84K7cw",
  defaultMintSetting: "d1KTr4HXiQVodmiXwSA3ig",
}

describe("cross-app Cashu vectors (shared with Linky)", () => {
  test.each(MINT_URL_VECTORS)("mint url %j normalises to %j", (input, out) => {
    expect(normalizeMintUrl(input)).toBe(out)
  })

  test.each(OPERATION_KEY_VECTORS)("operation key $key", (vector) => {
    expect(operationKeyOf(vector.operation)).toBe(vector.key)
    expect(cashuOperationIdFor(vector.key)).toBe(vector.id)
  })

  test("a proof id hashes its secret", () => {
    expect(cashuProofIdFor(PROOF_ID_VECTOR.secret)).toBe(PROOF_ID_VECTOR.id)
  })

  test("meta rows have Linky's ids", () => {
    expect(shardPointerIdFor("cashu")).toBe(
      META_ROW_ID_VECTORS.cashuShardPointer
    )
    expect(linkySettingIdFor("defaultMint")).toBe(
      META_ROW_ID_VECTORS.defaultMintSetting
    )
  })
})
