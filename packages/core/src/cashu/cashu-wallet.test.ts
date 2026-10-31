import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { MintUrl } from "../modules/cashu/cashu-types.ts"
import {
  createCashuTest,
  storeTestCashuProofs,
  testMintUrl,
} from "../testing/cashu.ts"
import { foreignKeysetOwner, loadCashuWallet } from "./cashu-wallet.ts"

const otherMintUrl = MintUrl("https://other.mint.test")

describe("loadCashuWallet", () => {
  test("refuses a mint that lists a keyset another mint owns", async () => {
    // Same key seed: the second mint lists the first mint's keyset.
    const keySeed = new Uint8Array(32).fill(7)
    await using t = await createCashuTest({
      mint: { keySeed },
      extraMints: [{ url: otherMintUrl, keySeed }],
    })
    await storeTestCashuProofs(t.deps.evolu, [
      {
        mintUrl: testMintUrl,
        keysetId: t.mint.keysetId,
        amount: 1,
        secret: "s",
      },
    ])
    await using run = testCreateRun(t.deps)

    const own = await run(loadCashuWallet(testMintUrl))
    expect(own.ok).toBe(true)
    const foreign = await run(loadCashuWallet(otherMintUrl))
    expect(!foreign.ok && foreign.error).toMatchObject({
      type: "MintRejected",
      keysetOwner: testMintUrl,
    })
  })

  test("an unreachable mint is MintUnreachable", async () => {
    await using t = await createCashuTest()
    t.mint.failNext("info", { type: "unreachable" })
    await using run = testCreateRun(t.deps)
    const result = await run(loadCashuWallet(testMintUrl))
    expect(!result.ok && result.error.type).toBe("MintUnreachable")
  })
})

describe("foreignKeysetOwner", () => {
  test("a keyset belongs to the mint of its oldest proof", () => {
    expect(
      foreignKeysetOwner(otherMintUrl, [
        { mintUrl: testMintUrl, keysetId: "00aa" },
        { mintUrl: otherMintUrl, keysetId: "00aa" },
      ])
    ).toBe(testMintUrl)
    expect(
      foreignKeysetOwner(testMintUrl, [
        { mintUrl: testMintUrl, keysetId: "00aa" },
      ])
    ).toBeNull()
  })
})
