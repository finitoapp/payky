import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import {
  estimateCashuMove,
  moveCashuFunds,
} from "@/core/cashu/cashu-autoswap.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "@/core/cashu/cashu-topup.ts"
import { sumAvailableByMint } from "@/core/modules/cashu/cashu-queries.ts"
import { CashuAmount, MintUrl } from "@/core/modules/cashu/cashu-types.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "@/test/cashu.ts"

const targetMint = MintUrl("https://target.mint.test")

const setup = async () => {
  const t = await createCashuTest({ extraMints: [{ url: targetMint }] })
  const deps = {
    ...t.deps,
    masterKey: testCashuMasterKey,
    date: { now: () => new Date() },
  }
  await using run = testCreateRun(deps)
  const quote = await run.orThrow(
    createCashuTopupQuote({ mint: testMintUrl, amount: CashuAmount(1000) })
  )
  t.mint.payMintQuote(quote.quoteId)
  await run.orThrow(claimCashuTopup(quote.operationId))
  return { t, deps }
}

const balances = async (deps: Awaited<ReturnType<typeof setup>>["deps"]) =>
  sumAvailableByMint(await deps.cashuShardStore.loadProofs())

describe("moving funds between mints", () => {
  test("estimates a move without touching a proof", async () => {
    const { t, deps } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)

    const estimate = await run.orThrow(
      estimateCashuMove({ sourceMint: testMintUrl, targetMint, amount: 500 })
    )

    expect(estimate).toMatchObject({ amount: 500, lightningFeeReserve: 5 })
    expect(estimate.totalFromSource).toBe(505)
    expect((await balances(deps)).get(testMintUrl)).toBe(1000)
  })

  test("moves an amount: a melt at the source, a mint at the target", async () => {
    const { t, deps } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)

    const moved = await run.orThrow(
      moveCashuFunds({ sourceMint: testMintUrl, targetMint, amount: 500 })
    )

    expect(moved).toEqual({ moved: 500 })
    const after = await balances(deps)
    expect(after.get(targetMint)).toBe(500)
    expect(after.get(testMintUrl)).toBe(500)
    const operations = await deps.cashuShardStore.loadOperations()
    expect(operations.find((op) => op.kind === "autoswap")).toMatchObject({
      status: "done",
      mint: targetMint,
      sourceMint: testMintUrl,
    })
    expect(operations.find((op) => op.kind === "melt")?.status).toBe("paid")
  })

  test("a sweep moves everything the fees leave", async () => {
    const { t, deps } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)

    const moved = await run.orThrow(
      moveCashuFunds({ sourceMint: testMintUrl, targetMint })
    )

    const after = await balances(deps)
    expect(after.get(targetMint)).toBe(moved.moved)
    expect(moved.moved).toBeGreaterThan(980)
    expect(after.get(testMintUrl) ?? 0).toBeLessThan(20)
  })
})
