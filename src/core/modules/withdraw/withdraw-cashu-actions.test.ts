import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { resumeCashuMelt } from "@/core/cashu/cashu-melt.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "@/core/cashu/cashu-topup.ts"
import { saveCashuAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { CashuAmount } from "@/core/modules/cashu/cashu-types.ts"
import { createTestInvoice } from "@/core/modules/shared/lightning-invoice-test-fixtures.ts"
import { parseLightningInvoice } from "@/core/modules/shared/lightning-invoice-utils.ts"
import {
  NonEmptyString255,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "@/test/cashu.ts"
import {
  executeCashuWithdrawal,
  quoteCashuWithdrawal,
  settleCashuWithdrawal,
} from "./withdraw-cashu-actions.ts"
import {
  toWithdrawalView,
  withdrawalsByAccountQuery,
} from "./withdraw-queries.ts"

const setup = async () => {
  const t = await createCashuTest()
  const deps = {
    ...t.deps,
    masterKey: testCashuMasterKey,
    date: { now: () => new Date() },
  }
  await using run = testCreateRun(deps)
  const accountId = await run.ok(saveCashuAccount({ enabled: true }))
  if (accountId === null) throw new Error("no Cashu account")
  const quote = await run.orThrow(
    createCashuTopupQuote({ mint: testMintUrl, amount: CashuAmount(1000) })
  )
  t.mint.payMintQuote(quote.quoteId)
  await run.orThrow(claimCashuTopup(quote.operationId))
  return { t, deps, accountId }
}

const loadWithdrawals = async (
  deps: Awaited<ReturnType<typeof setup>>["deps"],
  accountId: AccountId
) =>
  (await deps.evolu.loadQuery(withdrawalsByAccountQuery(accountId, 50))).map(
    toWithdrawalView
  )

/** An invoice for 50 sat that expires an hour from now. */
const invoice50 = () => {
  const parsed = parseLightningInvoice(
    createTestInvoice({
      hrp: "lnbc500n",
      timestamp: Math.floor(Date.now() / 1000),
      expirySeconds: 3600,
    })
  )
  if (!parsed.ok) throw new Error("bad test invoice")
  return { kind: "lightning-invoice" as const, ...parsed.value }
}

describe("Cashu withdrawals", () => {
  test("melts at the mint and books the money that left, once", async () => {
    const { t, deps, accountId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const quote = await run.orThrow(
      quoteCashuWithdrawal({ mint: testMintUrl, destination: invoice50() })
    )
    expect(quote.cost).toMatchObject({ amount: 50, feeReserve: 2 })

    const result = await run.orThrow(
      executeCashuWithdrawal({ accountId, deviceId: null, quote })
    )
    expect(result.totalSpent).toBe(50)
    await run(
      settleCashuWithdrawal(
        (await deps.cashuShardStore.loadOperations()).find(
          (op) => op.kind === "melt"
        )?.id ?? ("" as never)
      )
    )

    const [withdrawal] = await loadWithdrawals(deps, accountId)
    expect(withdrawal).toMatchObject({
      amountSats: 50,
      target: { kind: "cashu", mintUrl: testMintUrl },
      state: { status: "done", debitedSats: 50, feeSats: 0 },
    })
  })

  test("a melt the mint does not pay marks the withdrawal failed", async () => {
    const { t, deps, accountId } = await setup()
    await using _ = t
    t.mint.queueMeltOutcome("UNPAID")
    await using run = testCreateRun(deps)
    const quote = await run.orThrow(
      quoteCashuWithdrawal({ mint: testMintUrl, destination: invoice50() })
    )

    const result = await run(
      executeCashuWithdrawal({ accountId, deviceId: null, quote })
    )

    const [withdrawal] = await loadWithdrawals(deps, accountId)
    expect(result).toEqual({
      ok: false,
      error: { type: "WithdrawalRejected", withdrawalId: withdrawal?.id },
    })
    expect(withdrawal?.state).toMatchObject({
      status: "failed",
      reason: "rejected",
    })
  })

  test("a lost response stays in progress until the resume settles it; it is never sent again", async () => {
    const { t, deps, accountId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const quote = await run.orThrow(
      quoteCashuWithdrawal({ mint: testMintUrl, destination: invoice50() })
    )
    t.mint.failNext("melt", { type: "lostResponse" })
    t.mint.failNext("checkMeltQuote", { type: "ok" })
    t.mint.failNext("checkMeltQuote", { type: "unreachable" })

    const result = await run(
      executeCashuWithdrawal({ accountId, deviceId: null, quote })
    )
    const [pending] = await loadWithdrawals(deps, accountId)
    expect(result).toEqual({
      ok: false,
      error: { type: "WithdrawalOutcomeUnknown", withdrawalId: pending?.id },
    })
    expect(pending?.state).toEqual({ status: "pending" })

    const meltId =
      (await deps.cashuShardStore.loadOperations()).find(
        (op) => op.kind === "melt"
      )?.id ?? ("" as never)
    const melts = t.mint.requestCount("melt")
    const resumed = await run.orThrow(resumeCashuMelt(meltId))
    expect(resumed.type).toBe("paid")
    await run(
      settleCashuWithdrawal(
        meltId,
        resumed.type === "paid" ? resumed.receipt.totalSpent : undefined
      )
    )
    expect(t.mint.requestCount("melt")).toBe(melts)
    const [settled] = await loadWithdrawals(deps, accountId)
    expect(settled?.state).toMatchObject({ status: "done", debitedSats: 50 })
  })

  test("sends a Lightning address the comment it accepts and saves the merchant's own", async () => {
    const { t, deps, accountId } = await setup()
    await using _ = t
    const requested: string[] = []
    await using run = testCreateRun({
      ...deps,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        if (url.hostname !== "example.com") return deps.fetch(input, init)
        requested.push(url.href)
        if (url.pathname.startsWith("/.well-known/lnurlp/"))
          return Response.json({
            tag: "payRequest",
            callback: "https://example.com/cb",
            minSendable: 1000,
            maxSendable: 1_000_000,
            metadata: '[["text/plain","Pay Alice"]]',
            commentAllowed: 6,
          })
        return Response.json({ pr: invoice50().invoice, routes: [] })
      },
    })

    const quote = await run.orThrow(
      quoteCashuWithdrawal({
        mint: testMintUrl,
        destination: {
          kind: "lightning-address",
          address: "alice@example.com",
        },
        amountSats: PositiveInteger(50),
        recipientComment: "Thanks a lot",
      })
    )
    expect(quote).toMatchObject({
      lightningAddress: "alice@example.com",
      recipientText: "Pay Alice",
      recipientComment: "Thanks",
      amountSats: 50,
    })
    expect(requested).toEqual([
      "https://example.com/.well-known/lnurlp/alice",
      "https://example.com/cb?amount=50000&comment=Thanks",
    ])

    await run.orThrow(
      executeCashuWithdrawal({
        accountId,
        deviceId: null,
        quote,
        comment: NonEmptyString255("Rent"),
      })
    )
    const [withdrawal] = await loadWithdrawals(deps, accountId)
    expect(withdrawal).toMatchObject({
      comment: "Rent",
      target: { kind: "cashu", lightningAddress: "alice@example.com" },
    })
  })

  test("a melt refused before it was sent fails the withdrawal and returns why", async () => {
    const { t, deps, accountId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const quote = await run.orThrow(
      quoteCashuWithdrawal({ mint: testMintUrl, destination: invoice50() })
    )

    const result = await run(
      executeCashuWithdrawal({
        accountId,
        deviceId: null,
        // Less than the mint's fee reserve makes the melt cost too much.
        quote: { ...quote, cost: { ...quote.cost, maxTotal: 50 } },
      })
    )

    expect(!result.ok && result.error.type).toBe("CashuInsufficientFunds")
    const [withdrawal] = await loadWithdrawals(deps, accountId)
    expect(withdrawal?.state).toMatchObject({
      status: "failed",
      reason: "rejected",
    })
  })

  test("an address needs an amount", async () => {
    const { t, deps } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const result = await run(
      quoteCashuWithdrawal({
        mint: testMintUrl,
        destination: { kind: "lightning-address", address: "a@b.cz" },
      })
    )
    expect(!result.ok && result.error.type).toBe("CashuWithdrawalAmountNeeded")
  })
})
