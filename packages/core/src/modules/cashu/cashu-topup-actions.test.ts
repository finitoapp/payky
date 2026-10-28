import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import {
  createCashuTest,
  loadTestCashuProofs,
  testCashuBalance,
  testMintUrl,
} from "../../testing/cashu.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import { loadCashuTopup, loadOwnCashuAttempt } from "./cashu-guards.ts"
import { updateCashuOperation } from "./cashu-proof-actions.ts"
import {
  type CashuTopupQuote,
  claimCashuTopup,
  createCashuTopupQuote,
} from "./cashu-topup-actions.ts"
import { CashuAmount } from "./cashu-types.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

const setup = async (
  options: Parameters<typeof createCashuTest>[0] & {
    readonly clock?: { value: number }
  } = {}
) => {
  const clock: { value: number } = options.clock ?? { value: Date.now() }
  const t = await createCashuTest({ ...options, now: () => clock.value })
  return { t, clock }
}

const quoteFor = async (t: CashuTest, amount = 100) => {
  await using run = testCreateRun(t.deps)
  return await run.orThrow(
    createCashuTopupQuote({
      mint: testMintUrl,
      amount: CashuAmount(amount),
      purpose: "payment",
    })
  )
}

const claim = async (t: CashuTest, quote: CashuTopupQuote) => {
  await using run = testCreateRun(t.deps)
  return await run(claimCashuTopup(quote.operationId))
}

const loadTopup = async (t: CashuTest, quote: CashuTopupQuote) => {
  await using run = testCreateRun(t.deps)
  return await run.ok(loadCashuTopup(quote.operationId))
}

/** Another Payky device, with the same seed, mints the quote at its own slot. */
const anotherDeviceMints = async (t: CashuTest, quote: CashuTopupQuote) => {
  const other = await t.otherDevice()
  const wallet = await other.cashuWallet.load(testMintUrl)
  return wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
    type: "deterministic",
    counter: 5000,
  })
}

describe("createCashuTopupQuote", () => {
  test("writes the pending topup with the bound keyset and no counter", async () => {
    const { t } = await setup()
    await using _ = t
    const quote = await quoteFor(t)
    expect(await loadTopup(t, quote)).toMatchObject({
      kind: "topup",
      status: "pending",
      mintUrl: testMintUrl,
      keysetId: t.mint.keysetId,
      amount: 100,
      quoteId: quote.quoteId,
      lnInvoice: quote.invoice,
      expiresAt: quote.expiresAt,
      counter: null,
      locked: 0,
      purpose: "payment",
    })
  })

  test("locks the quote to the nostr key when the mint lists NUT-20, and claims it with that key", async () => {
    const { t } = await setup({ mint: { supportsNut20: true } })
    await using _ = t
    const quote = await quoteFor(t)
    expect((await loadTopup(t, quote))?.locked).toBe(1)
    t.mint.payMintQuote(quote.quoteId)
    const result = await claim(t, quote)
    expect(result.ok && result.value).toEqual({ type: "claimed", amount: 100 })
  })
})

describe("claimCashuTopup", () => {
  test("an unpaid quote writes nothing", async () => {
    const { t } = await setup()
    await using _ = t
    const quote = await quoteFor(t)
    const result = await claim(t, quote)
    expect(result.ok && result.value).toEqual({ type: "unpaid" })
    expect(await loadTestCashuProofs(t.deps.evolu)).toEqual([])
  })

  test("a paid quote is minted into available proofs and closed done in one batch", async () => {
    const { t } = await setup()
    await using _ = t
    const quote = await quoteFor(t)
    t.mint.payMintQuote(quote.quoteId)

    const result = await claim(t, quote)

    expect(result.ok && result.value).toEqual({ type: "claimed", amount: 100 })
    expect(await testCashuBalance(t.deps.evolu)).toBe(100)
    const topup = await loadTopup(t, quote)
    expect(topup?.status).toBe("done")
    expect(topup?.settledAt).not.toBeNull()
    await using run = testCreateRun(t.deps)
    expect(await run.ok(loadOwnCashuAttempt(quote.operationId))).toBe(
      topup?.counter
    )
  })

  test("a quote unpaid past its expiry is closed failed", async () => {
    const clock: { value: number } = { value: Date.now() }
    const { t } = await setup({ clock })
    await using _ = t
    const quote = await quoteFor(t)
    clock.value += 11 * 60_000

    const result = await claim(t, quote)

    expect(result.ok && result.value).toEqual({ type: "expired" })
    expect((await loadTopup(t, quote))?.status).toBe("failed")
  })

  test("a lost response is reclaimed from this device's own counter", async () => {
    const { t } = await setup()
    await using _ = t
    const quote = await quoteFor(t)
    t.mint.payMintQuote(quote.quoteId)
    t.mint.failNext("mint", { type: "lostResponse" })

    const lost = await claim(t, quote)
    expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
    expect(t.mint.mintQuoteState(quote.quoteId)).toBe("ISSUED")

    const resumed = await claim(t, quote)
    expect(resumed.ok && resumed.value).toEqual({
      type: "claimed",
      amount: 100,
    })
    expect(await testCashuBalance(t.deps.evolu)).toBe(100)
  })

  test("collisions with slots another device used are recovered", async () => {
    const { t } = await setup()
    await using _ = t
    const first = await quoteFor(t)
    t.mint.payMintQuote(first.quoteId)
    await claim(t, first)
    // Another device mints at slots this device's counter has not reached.
    const other = await t.otherDevice()
    const wallet = await other.cashuWallet.load(testMintUrl)
    const otherQuote = await wallet.createMintQuoteBolt11(100)
    t.mint.payMintQuote(otherQuote.quote)
    await wallet.mintProofsBolt11(100, otherQuote.quote, undefined, {
      type: "deterministic",
      counter: ((await loadTopup(t, first))?.counter ?? 0) + 64,
    })

    const second = await quoteFor(t)
    t.mint.payMintQuote(second.quoteId)
    const result = await claim(t, second)
    expect(result.ok && result.value).toEqual({ type: "claimed", amount: 100 })
  })

  test("a new device restores the keyset before its first claim and starts past what is signed", async () => {
    const { t } = await setup()
    await using _ = t
    const first = await quoteFor(t)
    t.mint.payMintQuote(first.quoteId)
    await claim(t, first)

    // The same account on a fresh device: no counters, no proofs yet.
    const other = await t.otherDevice()
    await using otherRun = testCreateRun(other)
    const quote = await otherRun.orThrow(
      createCashuTopupQuote({
        mint: testMintUrl,
        amount: CashuAmount(50),
        purpose: "payment",
      })
    )
    t.mint.payMintQuote(quote.quoteId)
    const result = await otherRun(claimCashuTopup(quote.operationId))

    expect(result.ok && result.value).toEqual({ type: "claimed", amount: 50 })
    // The restore brought the first device's unspent proofs in as well.
    expect(await testCashuBalance(other.evolu)).toBe(150)
  })

  describe("another device got there first", () => {
    test("an operation already done is left alone", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      await runMutationWithCompletion((options) =>
        updateCashuOperation(
          t.deps.evolu,
          quote.operationId,
          { status: "done" },
          options
        )
      )
      const signedBefore = t.mint.signedCount()
      const result = await claim(t, quote)
      expect(result.ok && result.value).toEqual({ type: "done" })
      expect(t.mint.signedCount()).toBe(signedBefore)
    })

    test("a counter this device did not reserve means another device is claiming: nothing is written", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      await runMutationWithCompletion((options) =>
        updateCashuOperation(
          t.deps.evolu,
          quote.operationId,
          { counter: NonNegativeInteger(5000) },
          options
        )
      )

      const result = await claim(t, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimedElsewhere",
        counter: 5000,
      })
      expect(await loadTestCashuProofs(t.deps.evolu)).toEqual([])
      expect((await loadTopup(t, quote))?.status).toBe("pending")
      expect(t.mint.mintQuoteState(quote.quoteId)).toBe("PAID")
    })

    test("a quote ISSUED that this device never minted: nothing is written, never failed", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      await anotherDeviceMints(t, quote)

      const result = await claim(t, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimedElsewhere",
        counter: null,
      })
      expect(await loadTestCashuProofs(t.deps.evolu)).toEqual([])
      expect((await loadTopup(t, quote))?.status).toBe("pending")
    })
  })
})
