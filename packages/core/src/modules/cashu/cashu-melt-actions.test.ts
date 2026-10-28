import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import {
  createCashuTest,
  fundTestCashuWallet,
  loadTestCashuOperations,
  loadTestCashuProofs,
  testCashuBalance,
  testMintUrl,
} from "../../testing/cashu.ts"
import { loadCashuMelt } from "./cashu-guards.ts"
import {
  meltCashu,
  quoteCashuMelt,
  resumeCashuMelt,
} from "./cashu-melt-actions.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

/** 50 sat: 500 nano-BTC. */
const invoice50 = "lnbc500n1pjfakeinvoice"

const setup = async (balance = 1000) => {
  const t = await createCashuTest()
  await fundTestCashuWallet(t, balance)
  return t
}

const melt = async (t: CashuTest) => {
  await using run = testCreateRun(t.deps)
  const cost = await run.orThrow(
    quoteCashuMelt({ mint: testMintUrl, invoice: invoice50 })
  )
  return {
    cost,
    result: await run(
      meltCashu({
        mint: testMintUrl,
        invoice: invoice50,
        quoteId: cost.quoteId,
        maxTotal: cost.maxTotal,
        purpose: "withdrawal",
      })
    ),
  }
}

describe("meltCashu", () => {
  test("pays the invoice, keeps the change and closes the melt paid", async () => {
    await using t = await setup()

    const { cost, result } = await melt(t)

    expect(cost).toMatchObject({ amount: 50, feeReserve: 2 })
    expect(result.ok && result.value).toMatchObject({
      paidAmount: 50,
      changeAmount: 2,
      totalSpent: 50,
    })
    expect(await testCashuBalance(t.deps.evolu)).toBe(950)
    if (!result.ok) return
    await using run = testCreateRun(t.deps)
    expect(await run.ok(loadCashuMelt(result.value.operationId))).toMatchObject(
      { status: "paid", purpose: "withdrawal", feeReserve: 2 }
    )
    expect(
      (await loadTestCashuProofs(t.deps.evolu)).filter(
        (proof) => proof.state === "held"
      )
    ).toEqual([])
  })

  test("an unpaid melt returns the inputs", async () => {
    await using t = await setup()
    t.mint.queueMeltOutcome("UNPAID")

    const { result } = await melt(t)

    expect(!result.ok && result.error.type).toBe("CashuMeltUnpaid")
    expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
  })

  test("a lost response is settled by the resume, never sent again", async () => {
    await using t = await setup()
    t.mint.failNext("melt", { type: "lostResponse" })
    // The first check passes; the one after the lost response gets nothing.
    t.mint.failNext("checkMeltQuote", { type: "ok" })
    t.mint.failNext("checkMeltQuote", { type: "unreachable" })

    const { result } = await melt(t)
    expect(!result.ok && result.error.type).toBe("CashuMeltPending")
    if (result.ok || result.error.type !== "CashuMeltPending") return
    const meltsBefore = t.mint.requestCount("melt")

    await using run = testCreateRun(t.deps)
    const resumed = await run.orThrow(resumeCashuMelt(result.error.operationId))

    expect(resumed.type).toBe("paid")
    expect(t.mint.requestCount("melt")).toBe(meltsBefore)
    expect(await testCashuBalance(t.deps.evolu)).toBe(950)
  })

  test("refuses a melt the balance cannot cover before anything moves", async () => {
    await using t = await setup(40)

    const { result } = await melt(t)

    expect(!result.ok && result.error.type).toBe("CashuInsufficientFunds")
    expect(await testCashuBalance(t.deps.evolu)).toBe(40)
    expect(
      (await loadTestCashuOperations(t.deps.evolu)).filter(
        (operation) => operation.kind === "melt"
      )
    ).toEqual([])
  })
})
