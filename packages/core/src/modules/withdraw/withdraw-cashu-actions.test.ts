import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "../../evolu/schema.ts"
import {
  createCashuTest,
  fundTestCashuWallet,
  loadTestCashuOperations,
  testCashuBalance,
  testMintUrl,
  watchTestQuery,
} from "../../testing/cashu.ts"
import { saveCashuAccount } from "../account/account-actions.ts"
import type { AccountId } from "../account/account-types.ts"
import { resumeCashuMelt } from "../cashu/cashu-melt-actions.ts"
import type { CashuOperationId } from "../cashu/cashu-types.ts"
import { createTestInvoice } from "../shared/lightning-invoice-test-fixtures.ts"
import { parseLightningInvoice } from "../shared/lightning-invoice-utils.ts"
import { NonEmptyString255, PositiveInteger } from "../shared/schema.ts"
import {
  executeCashuWithdrawal,
  loadCashuWithdrawalSettlement,
  quoteCashuWithdrawal,
} from "./withdraw-cashu-actions.ts"
import {
  toWithdrawalView,
  withdrawalsByAccountQuery,
} from "./withdraw-queries.ts"

/** Melts closed while their withdrawal's movement or failure is missing. */
const meltSettledWithoutWithdrawalQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperation")
    .innerJoin(
      "withdrawalLightningCashu",
      "withdrawalLightningCashu.meltOperationId",
      "cashuOperation.id"
    )
    .innerJoin("withdrawal", "withdrawal.id", "withdrawalLightningCashu.id")
    .leftJoin(
      "accountTransaction",
      "accountTransaction.id",
      "withdrawal.accountTransactionId"
    )
    .select(["cashuOperation.id", "cashuOperation.status"])
    .where((eb) =>
      eb.or([
        eb.and([
          eb("cashuOperation.status", "=", "paid"),
          eb("accountTransaction.id", "is", null),
        ]),
        eb.and([
          eb("cashuOperation.status", "in", ["unpaid", "failed"]),
          eb("withdrawal.failedAt", "is", null),
        ]),
      ])
    )
)

const setup = async () => {
  const t = await createCashuTest()
  const deps = t.deps
  await using run = testCreateRun(deps)
  const accountId = await run.ok(saveCashuAccount({ enabled: true }))
  if (accountId === null) throw new Error("no Cashu account")
  await fundTestCashuWallet(t, 1000)
  return { t, deps, accountId }
}

/** The one melt the wallet holds. */
const meltIdOf = async (
  deps: Awaited<ReturnType<typeof setup>>["deps"]
): Promise<CashuOperationId> => {
  const melt = (await loadTestCashuOperations(deps.evolu)).find(
    (operation) => operation.kind === "melt"
  )
  if (melt === undefined) throw new Error("no melt")
  return melt.id
}

const loadWithdrawals = async (
  deps: Awaited<ReturnType<typeof setup>>["deps"],
  accountId: AccountId
) =>
  (await deps.evolu.loadQuery(withdrawalsByAccountQuery(accountId, 50))).map(
    toWithdrawalView
  )

/** A mainnet invoice for `sats` that expires an hour from now. */
const invoiceFor = (sats: number) =>
  createTestInvoice({
    hrp: `lnbc${sats * 10}n`,
    timestamp: Math.floor(Date.now() / 1000),
    expirySeconds: 3600,
  })

/**
 * The test's mints behind `fetch`, and alice@example.com, a Lightning address
 * whose callback returns an invoice for whatever amount is asked.
 */
const lightningAddressFetch =
  ({
    mintFetch,
    requested,
    minSendable = 1000,
    maxSendable = 1_000_000,
    commentAllowed,
  }: {
    readonly mintFetch: typeof globalThis.fetch
    readonly requested: string[]
    readonly minSendable?: number
    readonly maxSendable?: number
    readonly commentAllowed?: number
  }) =>
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.hostname !== "example.com") return mintFetch(input, init)
    requested.push(url.href)
    if (url.pathname.startsWith("/.well-known/lnurlp/"))
      return Response.json({
        tag: "payRequest",
        callback: "https://example.com/cb",
        minSendable,
        maxSendable,
        metadata: '[["text/plain","Pay Alice"]]',
        commentAllowed,
      })
    const sats = Number(url.searchParams.get("amount")) / 1000
    return Response.json({ pr: invoiceFor(sats), routes: [] })
  }

const alice = {
  kind: "lightning-address",
  address: "alice@example.com",
} as const

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
  test("writes the movement or the failure in the batch that settles the melt", async () => {
    const { t, deps, accountId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    using watch = await watchTestQuery(
      deps.evolu,
      meltSettledWithoutWithdrawalQuery
    )

    const paid = await run.orThrow(
      quoteCashuWithdrawal({ mint: testMintUrl, destination: invoice50() })
    )
    await run.orThrow(
      executeCashuWithdrawal({ accountId, deviceId: null, quote: paid })
    )
    t.mint.queueMeltOutcome("UNPAID")
    const unpaid = await run.orThrow(
      quoteCashuWithdrawal({ mint: testMintUrl, destination: invoice50() })
    )
    await run(
      executeCashuWithdrawal({ accountId, deviceId: null, quote: unpaid })
    )

    expect(watch.seen).toEqual([])
    expect(
      (await loadWithdrawals(deps, accountId)).map((row) => row?.state.status)
    ).toEqual(expect.arrayContaining(["done", "failed"]))
  })

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

    const meltId = await meltIdOf(deps)
    const melts = t.mint.requestCount("melt")
    const settlement = await run.ok(loadCashuWithdrawalSettlement(meltId))
    const resumed = await run.orThrow(
      resumeCashuMelt(meltId, settlement ?? undefined)
    )
    expect(resumed.type).toBe("paid")
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
      fetch: lightningAddressFetch({
        mintFetch: deps.fetch,
        requested,
        commentAllowed: 6,
      }),
    })

    const quote = await run.orThrow(
      quoteCashuWithdrawal({
        mint: testMintUrl,
        destination: alice,
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

  test("an invoice without an amount is refused", async () => {
    const { t, deps } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const parsed = parseLightningInvoice(
      createTestInvoice({
        hrp: "lnbc",
        timestamp: Math.floor(Date.now() / 1000),
        expirySeconds: 3600,
      })
    )
    if (!parsed.ok) throw new Error("bad test invoice")
    const result = await run(
      quoteCashuWithdrawal({
        mint: testMintUrl,
        destination: { kind: "lightning-invoice", ...parsed.value },
      })
    )
    expect(!result.ok && result.error.type).toBe("CashuWithdrawalAmountNeeded")
  })

  test("refuses an amount outside the Lightning address's range", async () => {
    const { t, deps } = await setup()
    await using _ = t
    await using run = testCreateRun({
      ...deps,
      fetch: lightningAddressFetch({
        mintFetch: deps.fetch,
        requested: [],
        minSendable: 100_000,
      }),
    })
    expect(
      await run(
        quoteCashuWithdrawal({
          mint: testMintUrl,
          destination: alice,
          amountSats: PositiveInteger(50),
        })
      )
    ).toEqual({
      ok: false,
      error: {
        type: "WithdrawalAmountOutOfRange",
        minSats: 100,
        maxSats: 1000,
      },
    })
  })

  test("refuses an invoice whose amount and the mint's fees exceed the balance, naming the most it can send", async () => {
    const { t, deps } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const parsed = parseLightningInvoice(invoiceFor(995))
    if (!parsed.ok) throw new Error("bad test invoice")
    expect(
      await run(
        quoteCashuWithdrawal({
          mint: testMintUrl,
          destination: { kind: "lightning-invoice", ...parsed.value },
        })
      )
    ).toEqual({
      ok: false,
      error: {
        type: "InsufficientWithdrawalBalance",
        availableSats: 1000,
        requestedSats: 1005,
        maxSendableSats: 990,
      },
    })
  })

  describe("withdraw all to a Lightning address", () => {
    test("sends the balance minus the mint's fee reserve and input fee", async () => {
      const { t, deps } = await setup()
      await using _ = t
      const requested: string[] = []
      await using run = testCreateRun({
        ...deps,
        fetch: lightningAddressFetch({ mintFetch: deps.fetch, requested }),
      })

      const quote = await run.orThrow(
        quoteCashuWithdrawal({ mint: testMintUrl, destination: alice })
      )

      expect(quote).toMatchObject({
        amountSats: 990,
        availableSats: 1000,
        withdrawAll: true,
        cost: { feeReserve: 10, inputFee: 0, maxTotal: 1000 },
      })
      expect(requested).toEqual([
        "https://example.com/.well-known/lnurlp/alice",
        "https://example.com/cb?amount=1000000",
        "https://example.com/cb?amount=990000",
      ])
    })

    test("sends at most the Lightning address's maxSendable", async () => {
      const { t, deps } = await setup()
      await using _ = t
      const requested: string[] = []
      await using run = testCreateRun({
        ...deps,
        fetch: lightningAddressFetch({
          mintFetch: deps.fetch,
          requested,
          maxSendable: 500_000,
        }),
      })

      const quote = await run.orThrow(
        quoteCashuWithdrawal({ mint: testMintUrl, destination: alice })
      )

      expect(quote).toMatchObject({ amountSats: 500, withdrawAll: true })
      expect(requested).toEqual([
        "https://example.com/.well-known/lnurlp/alice",
        "https://example.com/cb?amount=500000",
        "https://example.com/cb?amount=500000",
      ])
    })

    test("is refused when the balance minus the fees is below the Lightning address's minSendable", async () => {
      const { t, deps } = await setup()
      await using _ = t
      await using run = testCreateRun({
        ...deps,
        fetch: lightningAddressFetch({
          mintFetch: deps.fetch,
          requested: [],
          minSendable: 995_000,
        }),
      })

      expect(
        await run(
          quoteCashuWithdrawal({ mint: testMintUrl, destination: alice })
        )
      ).toEqual({
        ok: false,
        error: {
          type: "InsufficientWithdrawalBalance",
          availableSats: 1000,
          requestedSats: 1005,
        },
      })
    })

    test("melts it and books what left; the unused reserve stays at the mint", async () => {
      const { t, deps, accountId } = await setup()
      await using _ = t
      await using run = testCreateRun({
        ...deps,
        fetch: lightningAddressFetch({ mintFetch: deps.fetch, requested: [] }),
      })
      const quote = await run.orThrow(
        quoteCashuWithdrawal({ mint: testMintUrl, destination: alice })
      )

      await run.orThrow(
        executeCashuWithdrawal({ accountId, deviceId: null, quote })
      )

      const [withdrawal] = await loadWithdrawals(deps, accountId)
      expect(withdrawal).toMatchObject({
        amountSats: 990,
        state: { status: "done", debitedSats: 990 },
      })
      expect(await testCashuBalance(deps.evolu)).toBe(10)
    })
  })
})
