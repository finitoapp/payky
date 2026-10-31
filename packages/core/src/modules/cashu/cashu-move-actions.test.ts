import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createCashuWalletDep } from "../../cashu/cashu-wallet.ts"
import { createQuery, type Evolu } from "../../evolu/schema.ts"
import {
  createCashuTest,
  fundTestCashuWallet,
  loadTestCashuOperations,
  testCashuBalances,
  testCashuMasterKey,
  testMintUrl,
  watchTestQuery,
} from "../../testing/cashu.ts"
import { deriveCashuWalletSeed } from "../shared/key-derivation.ts"
import { resumeCashuMelt } from "./cashu-melt-actions.ts"
import {
  estimateCashuMove,
  loadCashuMoveSettlement,
  moveCashuFunds,
} from "./cashu-move-actions.ts"
import { claimCashuTopup } from "./cashu-topup-actions.ts"
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

const targetTopup = async (t: { readonly deps: { readonly evolu: Evolu } }) =>
  (await loadTestCashuOperations(t.deps.evolu)).find(
    (operation) =>
      operation.kind === "topup" && operation.mintUrl === targetMint
  )

/** Melts a move's source closed `failed`, while the move's topup is still open. */
const failedMeltOpenTopupQuery = createQuery((db) =>
  db
    .selectFrom("cashuMove")
    .innerJoin("cashuOperation as melt", "melt.id", "cashuMove.meltOperationId")
    .innerJoin(
      "cashuOperation as topup",
      "topup.id",
      "cashuMove.topupOperationId"
    )
    .select(["cashuMove.id"])
    .where("melt.status", "=", "failed")
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
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        amount: 500,
        maxTotal: 505,
      })
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

    const estimate = await run.orThrow(
      estimateCashuMove({ sourceMint: testMintUrl, targetMint })
    )
    const moved = await run.orThrow(
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        maxTotal: estimate.totalFromSource,
      })
    )

    const after = await testCashuBalances(t.deps.evolu)
    expect(after.get(targetMint)).toBe(moved.moved)
    expect(moved.moved).toBeGreaterThan(980)
    expect(after.get(testMintUrl) ?? 0).toBeLessThan(20)
  })

  test("fees that rose since the estimate stop the move before anything is written or paid", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)
    const estimate = await run.orThrow(
      estimateCashuMove({ sourceMint: testMintUrl, targetMint, amount: 500 })
    )
    const operationsBefore = await loadTestCashuOperations(t.deps.evolu)
    // The source's Lightning fee reserve jumps after the merchant confirmed.
    t.mint.setMeltFeeReservePercent(5)

    const moved = await run(
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        amount: 500,
        maxTotal: estimate.totalFromSource,
      })
    )

    expect(!moved.ok && moved.error).toEqual({
      type: "CashuMoveCostRose",
      mint: testMintUrl,
      confirmed: 505,
      needed: 525,
    })
    expect(t.mint.requestCount("melt")).toBe(0)
    expect(t.mint.requestCount("swap")).toBe(0)
    expect(await loadTestCashuOperations(t.deps.evolu)).toEqual(
      operationsBefore
    )
    expect(await t.deps.evolu.loadQuery(movesQuery)).toEqual([])
    expect((await testCashuBalances(t.deps.evolu)).get(testMintUrl)).toBe(1000)
  })

  test("a melt the source does not pay closes the move's topup in the same batch", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)
    t.mint.queueMeltOutcome("UNPAID")
    using watch = await watchTestQuery(t.deps.evolu, unpaidMeltOpenTopupQuery)

    const moved = await run(
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        amount: 500,
        maxTotal: 505,
      })
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

  test("a move that fails before its melt is written closes the move's topup", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)
    // The source cannot be asked about its quote: no melt is written or sent.
    t.mint.failNext("checkMeltQuote", { type: "unreachable" })

    const moved = await run(
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        amount: 500,
        maxTotal: 505,
      })
    )

    expect(!moved.ok && moved.error.type).toBe("MintUnreachable")
    expect(t.mint.requestCount("melt")).toBe(0)
    expect((await targetTopup(t))?.status).toBe("failed")
    expect((await testCashuBalances(t.deps.evolu)).get(testMintUrl)).toBe(1000)
  })

  test("a pre-swap the source refuses closes the melt and the move's topup together", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)
    t.mint.failNext("swap", {
      type: "error",
      code: 11010,
      detail: "refused",
    })
    using watch = await watchTestQuery(t.deps.evolu, failedMeltOpenTopupQuery)

    const moved = await run(
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        amount: 500,
        maxTotal: 505,
      })
    )

    expect(!moved.ok && moved.error.type).toBe("MintRejected")
    expect(watch.seen).toEqual([])
    expect((await targetTopup(t))?.status).toBe("failed")
    expect((await testCashuBalances(t.deps.evolu)).get(testMintUrl)).toBe(1000)
  })

  test("a melt that may have been sent leaves the move's topup pending until it recovers", async () => {
    await using t = await setup()
    await using run = testCreateRun(t.deps)
    t.mint.failNext("melt", { type: "lostResponse" })
    t.mint.failNext("checkMeltQuote", { type: "ok" })
    t.mint.failNext("checkMeltQuote", { type: "unreachable" })

    const moved = await run(
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        amount: 500,
        maxTotal: 505,
      })
    )

    expect(!moved.ok && moved.error.type).toBe("CashuMeltPending")
    if (moved.ok || moved.error.type !== "CashuMeltPending") return
    const topup = await targetTopup(t)
    expect(topup?.status).toBe("pending")
    if (topup === undefined) return

    // The job resumes the melt with the move's settlement, then claims.
    const settlement = await run.ok(
      loadCashuMoveSettlement(moved.error.operationId)
    )
    const resumed = await run.orThrow(
      resumeCashuMelt(moved.error.operationId, settlement ?? undefined)
    )
    expect(resumed.type).toBe("paid")
    const claim = await run.orThrow(claimCashuTopup(topup.id))
    expect(claim).toEqual({ type: "claimed", amount: 500 })
    expect((await testCashuBalances(t.deps.evolu)).get(targetMint)).toBe(500)
  })
})

describe("a move is done once its melt is paid (cashu/0032)", () => {
  /**
   * This device's deps over a `fetch` that, on its first mint call at the
   * target, lets another device mint the same quote first: the job of that
   * device claiming the move's topup in between this one's check and call.
   */
  const racedAtTheTarget = async (t: Awaited<ReturnType<typeof setup>>) => {
    const other = await t.otherDevice()
    const otherWallet = await other.cashuWallet.load(targetMint)
    let raced = false
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (
        !raced &&
        url.startsWith(targetMint) &&
        url.endsWith("/v1/mint/bolt11")
      ) {
        raced = true
        const { quote, outputs } = JSON.parse(String(init?.body)) as {
          readonly quote: string
          readonly outputs: ReadonlyArray<{ readonly amount: number }>
        }
        const amount = outputs.reduce((sum, output) => sum + output.amount, 0)
        await otherWallet.mintProofsBolt11(amount, quote, undefined, {
          type: "deterministic",
          counter: 9000,
        })
      }
      return t.deps.fetch(input, init)
    }
    return {
      ...t.deps,
      fetch,
      ...createCashuWalletDep({
        seed: deriveCashuWalletSeed(testCashuMasterKey),
        fetch,
      }),
    }
  }

  test("another device minting the target first leaves the move done, its topup to be reclaimed", async () => {
    await using t = await setup()
    await using run = testCreateRun(await racedAtTheTarget(t))

    const moved = await run(
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        amount: 500,
        maxTotal: 505,
      })
    )

    expect(moved.ok && moved.value).toEqual({ moved: 500 })
    expect((await testCashuBalances(t.deps.evolu)).get(testMintUrl)).toBe(500)
    expect((await targetTopup(t))?.status).toBe("pending")
  })

  test("a target the claim cannot reach leaves the move done, and the job claims it", async () => {
    await using t = await setup()
    t.others[0]?.failNext("checkMintQuote", { type: "unreachable" })
    await using run = testCreateRun(t.deps)

    const moved = await run(
      moveCashuFunds({
        sourceMint: testMintUrl,
        targetMint,
        amount: 500,
        maxTotal: 505,
      })
    )

    expect(moved.ok && moved.value).toEqual({ moved: 500 })
    const topup = await targetTopup(t)
    expect(topup?.status).toBe("pending")
    if (topup === undefined) throw new Error("no topup")
    const claimed = await run(claimCashuTopup(topup.id))
    expect(claimed.ok && claimed.value).toEqual({
      type: "claimed",
      amount: 500,
    })
    expect((await testCashuBalances(t.deps.evolu)).get(targetMint)).toBe(500)
  })
})
