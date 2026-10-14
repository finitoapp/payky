import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { resumeCashuMelt } from "@/core/cashu/cashu-melt.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "@/core/cashu/cashu-topup.ts"
import { saveCashuAccount } from "@/core/modules/account/account-actions.ts"
import { CashuAmount } from "@/core/modules/cashu/cashu-types.ts"
import { createTestInvoice } from "@/core/modules/shared/lightning-invoice-test-fixtures.ts"
import { parseLightningInvoice } from "@/core/modules/shared/lightning-invoice-utils.ts"
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
import { cashuWithdrawalsQuery } from "./withdraw-queries.ts"

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

    const [withdrawal] = await deps.evolu.loadQuery(
      cashuWithdrawalsQuery(accountId)
    )
    expect(withdrawal).toMatchObject({
      amountSats: 50,
      failedAt: null,
      movedAmount: -50,
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

    expect(!result.ok && result.error.type).toBe("CashuMeltUnpaid")
    const [withdrawal] = await deps.evolu.loadQuery(
      cashuWithdrawalsQuery(accountId)
    )
    expect(withdrawal?.failedAt).not.toBeNull()
    expect(withdrawal?.movedAmount).toBeNull()
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
    expect(!result.ok && result.error.type).toBe("CashuMeltPending")
    const [pending] = await deps.evolu.loadQuery(
      cashuWithdrawalsQuery(accountId)
    )
    expect(pending).toMatchObject({ failedAt: null, movedAmount: null })

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
    const [settled] = await deps.evolu.loadQuery(
      cashuWithdrawalsQuery(accountId)
    )
    expect(settled?.movedAmount).toBe(-50)
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
