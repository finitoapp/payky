import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import {
  meltCashu,
  quoteCashuMelt,
  resumeCashuMelt,
} from "@/core/cashu/cashu-melt.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "@/core/cashu/cashu-topup.ts"
import { sumAvailableByMint } from "@/core/modules/cashu/cashu-queries.ts"
import { CashuAmount } from "@/core/modules/cashu/cashu-types.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "@/test/cashu.ts"

/** 50 sat: 500 nano-BTC. */
const invoice50 = "lnbc500n1pjfakeinvoice"

const setup = async (balance = 1000) => {
  const t = await createCashuTest()
  const deps = {
    ...t.deps,
    masterKey: testCashuMasterKey,
    date: { now: () => new Date() },
  }
  await using run = testCreateRun(deps)
  const quote = await run.orThrow(
    createCashuTopupQuote({ mint: testMintUrl, amount: CashuAmount(balance) })
  )
  t.mint.payMintQuote(quote.quoteId)
  await run.orThrow(claimCashuTopup(quote.operationId))
  return { t, deps }
}

type Setup = Awaited<ReturnType<typeof setup>>

const balance = async (deps: Setup["deps"]) =>
  sumAvailableByMint(await deps.cashuShardStore.loadProofs()).get(
    testMintUrl
  ) ?? 0

const melt = async (deps: Setup["deps"]) => {
  await using run = testCreateRun(deps)
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
      })
    ),
  }
}

describe("meltCashu", () => {
  test("pays the invoice, keeps the change and closes the melt paid", async () => {
    const { t, deps } = await setup()
    await using _ = t

    const { cost, result } = await melt(deps)

    expect(cost).toMatchObject({ amount: 50, feeReserve: 2 })
    expect(result.ok && result.value).toMatchObject({
      paidAmount: 50,
      changeAmount: 2,
      totalSpent: 50,
    })
    expect(await balance(deps)).toBe(950)
    const [operation] = (await deps.cashuShardStore.loadOperations()).filter(
      (op) => op.kind === "melt"
    )
    expect(operation?.status).toBe("paid")
    expect(
      (await deps.cashuShardStore.loadProofs()).filter(
        (proof) => proof.state === "held"
      )
    ).toEqual([])
  })

  test("an unpaid melt returns the inputs", async () => {
    const { t, deps } = await setup()
    await using _ = t
    t.mint.queueMeltOutcome("UNPAID")

    const { result } = await melt(deps)

    expect(!result.ok && result.error.type).toBe("CashuMeltUnpaid")
    expect(await balance(deps)).toBe(1000)
  })

  test("a lost response is settled by the resume, never sent again", async () => {
    const { t, deps } = await setup()
    await using _ = t
    t.mint.failNext("melt", { type: "lostResponse" })
    // The first check passes; the one after the lost response gets nothing.
    t.mint.failNext("checkMeltQuote", { type: "ok" })
    t.mint.failNext("checkMeltQuote", { type: "unreachable" })

    const { result } = await melt(deps)
    expect(!result.ok && result.error.type).toBe("CashuMeltPending")
    if (result.ok || result.error.type !== "CashuMeltPending") return
    const meltsBefore = t.mint.requestCount("melt")

    await using run = testCreateRun(deps)
    const resumed = await run.orThrow(resumeCashuMelt(result.error.operationId))

    expect(resumed.type).toBe("paid")
    expect(t.mint.requestCount("melt")).toBe(meltsBefore)
    expect(await balance(deps)).toBe(950)
  })

  test("refuses a melt the balance cannot cover before anything moves", async () => {
    const { t, deps } = await setup(40)
    await using _ = t

    const { result } = await melt(deps)

    expect(!result.ok && result.error.type).toBe("CashuInsufficientFunds")
    expect(await balance(deps)).toBe(40)
    expect(
      (await deps.cashuShardStore.loadOperations()).filter(
        (op) => op.kind === "melt"
      )
    ).toEqual([])
  })
})
