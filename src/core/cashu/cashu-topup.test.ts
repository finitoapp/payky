import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import {
  type CashuTopupQuote,
  claimCashuTopup,
  createCashuTopupQuote,
} from "@/core/cashu/cashu-topup.ts"
import { cashuClaimAttemptQuery } from "@/core/evolu/device-cashu.ts"
import { CashuAmount } from "@/core/modules/cashu/cashu-types.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "@/test/cashu.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

const setup = async (
  options: Parameters<typeof createCashuTest>[0] & {
    readonly nowMs?: { value: number }
  } = {}
) => {
  const clock = options.nowMs ?? { value: Date.now() }
  const t = await createCashuTest({ ...options, now: () => clock.value })
  const deps = {
    ...t.deps,
    masterKey: testCashuMasterKey,
    date: { now: () => new Date(clock.value) },
  }
  return { t, deps, clock }
}

const quoteFor = async (
  deps: Awaited<ReturnType<typeof setup>>["deps"],
  amount = 100
): Promise<CashuTopupQuote> => {
  await using run = testCreateRun(deps)
  return await run.orThrow(
    createCashuTopupQuote({ mint: testMintUrl, amount: CashuAmount(amount) })
  )
}

const claim = async (
  deps: Awaited<ReturnType<typeof setup>>["deps"],
  quote: CashuTopupQuote
) => {
  await using run = testCreateRun(deps)
  return await run(claimCashuTopup(quote.operationId))
}

/** Linky, on another device, claims the quote with its own counter. */
const linkyClaims = async (t: CashuTest, quote: CashuTopupQuote) => {
  const wallet = await t.linkyWallet.cashuWallet.load(testMintUrl)
  return wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
    type: "deterministic",
    counter: 5000,
  })
}

describe("createCashuTopupQuote", () => {
  test("writes the pending topup Linky decodes, with the bound keyset and no counter", async () => {
    const { t, deps } = await setup()
    await using _ = t
    const quote = await quoteFor(deps)
    const operation = await t.deps.cashuShardStore.loadOperation(
      quote.operationId
    )
    expect(operation).toMatchObject({
      kind: "topup",
      status: "pending",
      mint: testMintUrl,
      unit: "sat",
      keysetId: t.mint.keysetId,
      amount: 100,
      quoteId: quote.quoteId,
      invoice: quote.invoice,
      counter: null,
      locked: 0,
    })
    expect(operation?.expiresAtSec).toBe(quote.expiresAtSec)
  })

  test("locks the quote to the nostr key when the mint lists NUT-20, and claims it with that key", async () => {
    const { t, deps } = await setup({ mint: { supportsNut20: true } })
    await using _ = t
    const quote = await quoteFor(deps)
    expect(
      (await t.deps.cashuShardStore.loadOperation(quote.operationId))?.locked
    ).toBe(1)
    t.mint.payMintQuote(quote.quoteId)
    const result = await claim(deps, quote)
    expect(result.ok && result.value).toEqual({ type: "claimed", amount: 100 })
  })
})

describe("claimCashuTopup", () => {
  test("an unpaid quote writes nothing", async () => {
    const { t, deps } = await setup()
    await using _ = t
    const quote = await quoteFor(deps)
    const result = await claim(deps, quote)
    expect(result.ok && result.value).toEqual({ type: "unpaid" })
    expect(await t.deps.cashuShardStore.loadProofs()).toEqual([])
  })

  test("a paid quote is minted into available proofs and closed done", async () => {
    const { t, deps } = await setup()
    await using _ = t
    const quote = await quoteFor(deps)
    t.mint.payMintQuote(quote.quoteId)

    const result = await claim(deps, quote)

    expect(result.ok && result.value).toEqual({ type: "claimed", amount: 100 })
    const proofs = await t.deps.cashuShardStore.loadProofs()
    expect(proofs.reduce((sum, proof) => sum + proof.amount, 0)).toBe(100)
    expect(proofs.every((proof) => proof.state === "available")).toBe(true)
    const operation = await t.deps.cashuShardStore.loadOperation(
      quote.operationId
    )
    expect(operation?.status).toBe("done")
    const [attempt] = await t.deps.deviceEvolu.loadQuery(
      cashuClaimAttemptQuery(
        t.deps.cashuWallet.deviceAccountId,
        quote.operationId
      )
    )
    expect(attempt?.counter).toBe(operation?.counter)
  })

  test("a quote unpaid past its expiry is closed failed", async () => {
    const clock: { value: number } = { value: Date.now() }
    const { t, deps } = await setup({ nowMs: clock })
    await using _ = t
    const quote = await quoteFor(deps)
    clock.value += 11 * 60_000

    const result = await claim(deps, quote)

    expect(result.ok && result.value).toEqual({ type: "expired" })
    expect(
      (await t.deps.cashuShardStore.loadOperation(quote.operationId))?.status
    ).toBe("failed")
  })

  test("a lost response is reclaimed from this device's own counter", async () => {
    const { t, deps } = await setup()
    await using _ = t
    const quote = await quoteFor(deps)
    t.mint.payMintQuote(quote.quoteId)
    t.mint.failNext("mint", { type: "lostResponse" })

    const lost = await claim(deps, quote)
    expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
    expect(t.mint.mintQuoteState(quote.quoteId)).toBe("ISSUED")

    const resumed = await claim(deps, quote)
    expect(resumed.ok && resumed.value).toEqual({
      type: "claimed",
      amount: 100,
    })
    expect(
      (await t.deps.cashuShardStore.loadProofs()).reduce(
        (sum, proof) => sum + proof.amount,
        0
      )
    ).toBe(100)
  })

  test("collisions with slots Linky used are recovered", async () => {
    const { t, deps } = await setup()
    await using _ = t
    const first = await quoteFor(deps)
    t.mint.payMintQuote(first.quoteId)
    await claim(deps, first)
    // Linky mints at slots this device's counter has not reached yet.
    const wallet = await t.linkyWallet.cashuWallet.load(testMintUrl)
    const linkyQuote = await wallet.createMintQuoteBolt11(100)
    t.mint.payMintQuote(linkyQuote.quote)
    const operation = await t.deps.cashuShardStore.loadOperation(
      first.operationId
    )
    await wallet.mintProofsBolt11(100, linkyQuote.quote, undefined, {
      type: "deterministic",
      counter: (operation?.counter ?? 0) + 64,
    })

    const second = await quoteFor(deps)
    t.mint.payMintQuote(second.quoteId)
    const result = await claim(deps, second)
    expect(result.ok && result.value).toEqual({ type: "claimed", amount: 100 })
  })

  describe("someone else got there first", () => {
    test("an operation already done is left alone", async () => {
      const { t, deps } = await setup()
      await using _ = t
      const quote = await quoteFor(deps)
      await t.deps.cashuShardStore.updateOperation(quote.operationId, {
        status: "done",
      })
      const signedBefore = t.mint.signedCount()
      const result = await claim(deps, quote)
      expect(result.ok && result.value).toEqual({ type: "done" })
      expect(t.mint.signedCount()).toBe(signedBefore)
    })

    test("a counter this device did not reserve means Linky is claiming: nothing is written", async () => {
      const { t, deps } = await setup()
      await using _ = t
      const quote = await quoteFor(deps)
      t.mint.payMintQuote(quote.quoteId)
      await t.deps.cashuShardStore.updateOperation(quote.operationId, {
        counter: 5000,
      })

      const result = await claim(deps, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimedElsewhere",
        counter: 5000,
      })
      expect(await t.deps.cashuShardStore.loadProofs()).toEqual([])
      const operation = await t.deps.cashuShardStore.loadOperation(
        quote.operationId
      )
      expect(operation?.status).toBe("pending")
      expect(t.mint.mintQuoteState(quote.quoteId)).toBe("PAID")
    })

    test("a quote ISSUED that this device never minted: nothing is written, never failed", async () => {
      const { t, deps } = await setup()
      await using _ = t
      const quote = await quoteFor(deps)
      t.mint.payMintQuote(quote.quoteId)
      await linkyClaims(t, quote)

      const result = await claim(deps, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimedElsewhere",
        counter: null,
      })
      expect(await t.deps.cashuShardStore.loadProofs()).toEqual([])
      expect(
        (await t.deps.cashuShardStore.loadOperation(quote.operationId))?.status
      ).toBe("pending")
    })
  })
})
