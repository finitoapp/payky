import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createQuery } from "../../evolu/schema.ts"
import {
  createCashuTest,
  fundTestCashuWallet,
  loadTestCashuOperations,
  testCashuBalances,
  testMintUrl,
  watchTestQuery,
} from "../../testing/cashu.ts"
import { estimateCashuMove, moveCashuFunds } from "./cashu-move-actions.ts"
import { MintUrl } from "./cashu-types.ts"

const targetMint = MintUrl("https://target.mint.test")

const movesQuery = createQuery((db) =>
  db
    .selectFrom("cashuMove")
    .select([
      "sourceMintUrl",
      "targetMintUrl",
      "meltOperationId",
      "topupOperationId",
    ])
)

/** Melts a move's source did not pay, while the move's topup is still open. */
const unpaidMeltOpenTopupQuery = createQuery((db) =>
  db
    .selectFrom("cashuMove")
    .innerJoin("cashuOperation as melt", "melt.id", "cashuMove.meltOperationId")
    .innerJoin(
      "cashuOperation as topup",
      "topup.id",
      "cashuMove.topupOperationId"
    )
    .select(["cashuMove.id"])
    .where("melt.status", "=", "unpaid")
    .where("topup.status", "=", "pending")
)

const setup = async () => {
  const t = await createCashuTest({ extraMints: [{ url: targetMint }] })
  await fundTestCashuWallet(t, 1000)
  return t
}

describe("moving funds between mints", () => {
  test("estimates a move without touching a proof", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)

    const estimate = await run.orThrow(
      estimateCashuMove({ sourceMint: testMintUrl, targetMint, amount: 500 })
    )

    expect(estimate).toMatchObject({ amount: 500, lightningFeeReserve: 5 })
    expect(estimate.totalFromSource).toBe(505)
    expect((await testCashuBalances(t.deps.evolu)).get(testMintUrl)).toBe(1000)
  })

  test("moves an amount: a melt at the source, a topup at the target, linked by the move", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)

    const moved = await run.orThrow(
      moveCashuFunds({ sourceMint: testMintUrl, targetMint, amount: 500 })
    )

    expect(moved).toEqual({ moved: 500 })
    const after = await testCashuBalances(t.deps.evolu)
    expect(after.get(targetMint)).toBe(500)
    expect(after.get(testMintUrl)).toBe(500)
    const operations = await loadTestCashuOperations(t.deps.evolu)
    const melt = operations.find((operation) => operation.kind === "melt")
    const topup = operations.find(
      (operation) =>
        operation.kind === "topup" && operation.mintUrl === targetMint
    )
    expect(melt?.status).toBe("paid")
    expect(topup?.status).toBe("done")
    expect(await t.deps.evolu.loadQuery(movesQuery)).toEqual([
      {
        sourceMintUrl: testMintUrl,
        targetMintUrl: targetMint,
        meltOperationId: melt?.id,
        topupOperationId: topup?.id,
      },
    ])
  })

  test("a sweep moves everything the fees leave", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)

    const moved = await run.orThrow(
      moveCashuFunds({ sourceMint: testMintUrl, targetMint })
    )

    const after = await testCashuBalances(t.deps.evolu)
    expect(after.get(targetMint)).toBe(moved.moved)
    expect(moved.moved).toBeGreaterThan(980)
    expect(after.get(testMintUrl) ?? 0).toBeLessThan(20)
  })

  test("a melt the source does not pay closes the move's topup in the same batch", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)
    t.mint.queueMeltOutcome("UNPAID")
    using watch = await watchTestQuery(t.deps.evolu, unpaidMeltOpenTopupQuery)

    const moved = await run(
      moveCashuFunds({ sourceMint: testMintUrl, targetMint, amount: 500 })
    )

    expect(!moved.ok && moved.error.type).toBe("CashuMeltUnpaid")
    expect(watch.seen).toEqual([])
    const topup = (await loadTestCashuOperations(t.deps.evolu)).find(
      (operation) =>
        operation.kind === "topup" && operation.mintUrl === targetMint
    )
    expect(topup?.status).toBe("failed")
    expect((await testCashuBalances(t.deps.evolu)).get(testMintUrl)).toBe(1000)
  })
})
