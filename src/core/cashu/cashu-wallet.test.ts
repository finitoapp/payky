import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { loadKnownCashuMints } from "@/core/cashu/cashu-mints.ts"
import { loadCashuWallet } from "@/core/cashu/cashu-wallet.ts"
import { addCashuMint } from "@/core/evolu/device-cashu.ts"
import {
  CashuAmount,
  KeysetId,
  MintUrl,
} from "@/core/modules/cashu/cashu-types.ts"
import { createCashuTest, testMintUrl } from "@/test/cashu.ts"

const otherMintUrl = MintUrl("https://other.mint.test")

describe("loadCashuWallet", () => {
  test("refuses a mint that lists a keyset another mint owns", async () => {
    // Same key seed: the second mint lists the first mint's keyset.
    const keySeed = new Uint8Array(32).fill(7)
    await using t = await createCashuTest({
      mint: { keySeed },
      extraMints: [{ url: otherMintUrl, keySeed }],
    })
    await t.deps.cashuShardStore.insertProofs([
      {
        mint: testMintUrl,
        unit: "sat",
        keysetId: KeysetId(t.mint.keysetId),
        amount: CashuAmount(1),
        secret: "s",
        C: "02aa",
        dleq: null,
        state: "available",
        operationId: null,
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

describe("known mints", () => {
  test("are the mints proofs and operations name plus the ones this device saw or added", async () => {
    await using t = await createCashuTest({
      extraMints: [{ url: otherMintUrl }],
    })
    await using run = testCreateRun(t.deps)
    await run(loadCashuWallet(otherMintUrl))
    addCashuMint(
      t.deps.deviceEvolu,
      t.deps.cashuWallet.deviceAccountId,
      MintUrl("https://added.mint.test")
    )
    await t.deps.cashuShardStore.insertProofs([
      {
        mint: MintUrl("https://proof.mint.test"),
        unit: "sat",
        keysetId: KeysetId("00aa"),
        amount: CashuAmount(1),
        secret: "s",
        C: "02aa",
        dleq: null,
        state: "spent",
        operationId: null,
      },
    ])

    expect(
      await loadKnownCashuMints({
        store: t.deps.cashuShardStore,
        deviceEvolu: t.deps.deviceEvolu,
        deviceAccountId: t.deps.cashuWallet.deviceAccountId,
      })
    ).toEqual([
      "https://added.mint.test",
      "https://other.mint.test",
      "https://proof.mint.test",
    ])
  })
})
