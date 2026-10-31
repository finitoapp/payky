import {
  createOwnerWebSocketTransport,
  createWebSocket,
  sqliteTrue,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createCashuWalletDep } from "../../cashu/cashu-wallet.ts"
import type { Evolu } from "../../evolu/schema.ts"
import {
  createCashuTest,
  createTestCashuCustomer,
  fundTestCashuWallet,
  loadTestCashuOperations,
  loadTestCashuProofs,
  syncTestCashuAttempts,
  testCashuBalance,
  testCashuMasterKey,
  testMintUrl,
  upsertTestCashuAttemptElsewhere,
} from "../../testing/cashu.ts"
import { createTestRelay } from "../../testing/evolu-relay.ts"
import { saveCashuAccount } from "../account/account-actions.ts"
import { accountTransactionExistsQuery } from "../account-transaction/account-transaction-queries.ts"
import { deriveCashuAccountTransactionId } from "../account-transaction/account-transaction-utils.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { deriveCashuWalletSeed } from "../shared/key-derivation.ts"
import { NonNegativeInteger, TimestampMs } from "../shared/schema.ts"
import {
  CLAIMED_ELSEWHERE_GRACE_MS,
  latestOwnAttempt,
  loadCashuAttempts,
  loadCashuTopup,
} from "./cashu-guards.ts"
import {
  updateCashuOperation,
  upsertCashuOperationRow,
} from "./cashu-proof-actions.ts"
import {
  cashuOperationAttemptsQuery,
  contestedCashuTopupsWithOwnAttemptQuery,
} from "./cashu-queries.ts"
import {
  type CashuTopupQuote,
  claimCashuTopup,
  createCashuTopupQuote,
  reclaimContestedCashuTopup,
  upsertCashuTopupRows,
} from "./cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuOperationAttemptId,
  type CashuTokenText,
} from "./cashu-types.ts"
import { cashuReceiveOperationIdFor } from "./cashu-utils.ts"

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

const loadAttempts = async (t: CashuTest, quote: CashuTopupQuote) => {
  await using run = testCreateRun(t.deps)
  return await run.ok(loadCashuAttempts(quote.operationId))
}

/** Another device's attempt at `counter`, synced in. */
const attemptElsewhere = async (
  t: CashuTest,
  quote: CashuTopupQuote,
  counter: number
) => {
  const ids: Array<ReturnType<typeof upsertTestCashuAttemptElsewhere>> = []
  await runMutationWithCompletion((options) => {
    ids.push(
      upsertTestCashuAttemptElsewhere(
        t.deps.evolu,
        {
          operationId: quote.operationId,
          keysetId: t.mint.keysetId,
          counter,
          role: "mint",
        },
        options
      )
    )
  })
  const [id] = ids
  if (id === undefined) throw new Error("no attempt written")
  return id
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
      locked: 0,
      purpose: "payment",
    })
    expect(await loadAttempts(t, quote)).toEqual([])
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
    expect(await loadAttempts(t, quote)).toEqual([
      expect.objectContaining({ keysetId: t.mint.keysetId, own: true }),
    ])
  })

  test("a quote unpaid past its expiry is closed failed", async () => {
    const clock: { value: number } = { value: Date.now() }
    const { t } = await setup({ clock })
    await using _ = t
    const quote = await quoteFor(t)
    if (quote.expiresAt === null) throw new Error("no expiry")
    // Within the grace past the expiry it may be this device's clock
    // running ahead (cashu/0029).
    clock.value = quote.expiresAt + CLAIMED_ELSEWHERE_GRACE_MS
    const early = await claim(t, quote)
    expect(early.ok && early.value).toEqual({ type: "unpaid" })
    expect((await loadTopup(t, quote))?.status).toBe("pending")

    clock.value += 1
    const result = await claim(t, quote)

    expect(result.ok && result.value).toEqual({ type: "expired" })
    expect((await loadTopup(t, quote))?.status).toBe("failed")
  })

  test("a device clock ahead of the mint's never closes a quote the customer can still pay (cashu/0029)", async () => {
    const mintClock: { value: number } = { value: Date.now() }
    // This device's clock runs 3 minutes ahead of the mint's.
    const clock: { value: number } = { value: mintClock.value + 3 * 60_000 }
    const { t } = await setup({
      clock,
      mint: { now: () => mintClock.value },
    })
    await using _ = t
    const quote = await quoteFor(t)
    if (quote.expiresAt === null) throw new Error("no expiry")
    // Past the expiry by this device's clock, still valid by the mint's.
    mintClock.value = quote.expiresAt - 60_000
    clock.value = mintClock.value + 3 * 60_000

    const early = await claim(t, quote)
    expect(early.ok && early.value).toEqual({ type: "unpaid" })
    expect((await loadTopup(t, quote))?.status).toBe("pending")

    // The customer pays within the mint's validity window.
    t.mint.payMintQuote(quote.quoteId)
    const paid = await claim(t, quote)
    expect(paid.ok && paid.value).toEqual({ type: "claimed", amount: 100 })
    expect((await loadTopup(t, quote))?.status).toBe("done")
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

  /** A claim colliding with slots another device used, recovered. */
  const collisionRecovered = async (errorCodes: "current" | "legacy") => {
    const { t } = await setup({ mint: { errorCodes } })
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
      counter: ((await loadAttempts(t, first))[0]?.counter ?? 0) + 64,
    })

    const second = await quoteFor(t)
    t.mint.payMintQuote(second.quoteId)
    const result = await claim(t, second)
    expect(result.ok && result.value).toEqual({ type: "claimed", amount: 100 })
  }

  test("collisions with slots another device used are recovered, the mint answering in the current code set (cashu/0037)", () =>
    collisionRecovered("current"))

  test("collisions with slots another device used are recovered, the mint answering in the legacy code set (cashu/0037)", () =>
    collisionRecovered("legacy"))

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

    test("attempts only another device made mean it is claiming: nothing is written", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      const attemptId = await attemptElsewhere(t, quote, 5000)

      const result = await claim(t, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimedElsewhere",
        attemptId,
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
        attemptId: null,
      })
      expect(await loadTestCashuProofs(t.deps.evolu)).toEqual([])
      expect((await loadTopup(t, quote))?.status).toBe("pending")
    })
  })

  describe("every attempt is on record", () => {
    test("this device's lost claim is reclaimed though another device's attempt came after it", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      t.mint.failNext("mint", { type: "lostResponse" })
      const lost = await claim(t, quote)
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      await attemptElsewhere(t, quote, 5000)

      const result = await claim(t, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(100)
    })

    test("another device's lost claim is reclaimed by this device's own claim", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      // This device reserved first; the other minted at its own slots and
      // was gone before it stored the proofs.
      t.mint.failNext("mint", { type: "unreachable" })
      await claim(t, quote)
      await attemptElsewhere(t, quote, 5000)
      await anotherDeviceMints(t, quote)

      const result = await claim(t, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(100)
      expect((await loadTopup(t, quote))?.status).toBe("done")
    })
  })

  describe("two devices reserving one block each keep an attempt of their own (cashu/0029)", () => {
    test("one device's refused call never hides the outputs the other device's call got signed", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      const other = await t.otherDevice()
      await runMutationWithCompletion((options) =>
        upsertCashuTopupRows(other.evolu, quote, "payment", options)
      )

      // Neither device has seen the other's attempt, so both reserve the
      // same block. The other device's call is refused, a coded refusal
      // that signed nothing; this device's is signed and its answer lost.
      t.mint.failNext("mint", {
        type: "error",
        code: 11002,
        detail: "outputs do not match the quote amount",
      })
      await using otherRun = testCreateRun(other)
      const refused = await otherRun(claimCashuTopup(quote.operationId))
      expect(!refused.ok && refused.error.type).toBe("MintRejected")
      t.mint.failNext("mint", { type: "lostResponse" })
      const lost = await claim(t, quote)
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      expect(t.mint.mintQuoteState(quote.quoteId)).toBe("ISSUED")
      const [own] = await loadAttempts(t, quote)
      await using otherAttemptsRun = testCreateRun(other)
      const [refusedAttempt] = await otherAttemptsRun.ok(
        loadCashuAttempts(quote.operationId)
      )
      expect(refusedAttempt).toMatchObject({
        counter: own?.counter,
        rejected: true,
      })

      // The attempts sync both ways.
      await syncTestCashuAttempts(other.evolu, t.deps.evolu)
      await syncTestCashuAttempts(t.deps.evolu, other.evolu)

      const resumed = await claim(t, quote)
      expect(resumed.ok && resumed.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(100)
      const reclaimed = await otherRun(claimCashuTopup(quote.operationId))
      expect(reclaimed.ok && reclaimed.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await testCashuBalance(other.evolu)).toBe(100)
    })
  })

  describe("a claim made elsewhere is taken over past its grace", () => {
    /** Another device reserved slot 5000 for the quote, then went silent. */
    const claimedElsewhereAt5000 = async (t: CashuTest) => {
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      const attemptId = await attemptElsewhere(t, quote, 5000)
      return { quote, attemptId }
    }

    const takeOver = async (
      t: CashuTest,
      quote: CashuTopupQuote,
      attemptId: CashuOperationAttemptId
    ) => {
      await using run = testCreateRun(t.deps)
      return await run(
        claimCashuTopup(quote.operationId, { takeOver: attemptId })
      )
    }

    test("a quote the other device never minted is minted at its attempt", async () => {
      const { t } = await setup()
      await using _ = t
      const { quote, attemptId } = await claimedElsewhereAt5000(t)

      const result = await takeOver(t, quote, attemptId)

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(100)
      expect(t.mint.mintQuoteState(quote.quoteId)).toBe("ISSUED")
      expect((await loadTopup(t, quote))?.status).toBe("done")
      // The block adopted is reserved again as a row of this device's own
      // (cashu/0029); the other device's row is left as it was.
      expect(await loadAttempts(t, quote)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: attemptId, counter: 5000, own: false }),
          expect.objectContaining({ counter: 5000, own: true }),
        ])
      )
      expect(await loadAttempts(t, quote)).toHaveLength(2)
    })

    test("a quote the other device did mint is reclaimed at its attempt, never minted twice", async () => {
      const { t } = await setup()
      await using _ = t
      const { quote, attemptId } = await claimedElsewhereAt5000(t)
      await anotherDeviceMints(t, quote)

      const result = await takeOver(t, quote, attemptId)

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(100)
    })

    test("the takeover is this device's attempt: a lost response is reclaimed at once", async () => {
      const { t } = await setup()
      await using _ = t
      const { quote, attemptId } = await claimedElsewhereAt5000(t)
      t.mint.failNext("mint", { type: "lostResponse" })

      const lost = await takeOver(t, quote, attemptId)
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      expect(latestOwnAttempt(await loadAttempts(t, quote))?.counter).toBe(5000)

      const resumed = await claim(t, quote)
      expect(resumed.ok && resumed.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(100)
    })

    test("an attempt that is no longer the other device's latest is waited for again", async () => {
      const { t } = await setup()
      await using _ = t
      const { quote, attemptId } = await claimedElsewhereAt5000(t)
      // That device came back and reserved again.
      const newer = await attemptElsewhere(t, quote, 5064)

      const result = await takeOver(t, quote, attemptId)

      expect(result.ok && result.value).toEqual({
        type: "claimedElsewhere",
        attemptId: newer,
      })
      expect(t.mint.mintQuoteState(quote.quoteId)).toBe("PAID")
    })
  })
  test("a quote issued between the check and the call is read again, not taken for a refusal (cashu/0032)", async () => {
    const { t } = await setup()
    await using _ = t
    const quote = await quoteFor(t)
    t.mint.payMintQuote(quote.quoteId)
    // Another device mints the quote while this device's call is on its way.
    const other = await t.otherDevice()
    const otherWallet = await other.cashuWallet.load(testMintUrl)
    let raced = false
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!raced && url.endsWith("/v1/mint/bolt11")) {
        raced = true
        await otherWallet.mintProofsBolt11(100, quote.quoteId, undefined, {
          type: "deterministic",
          counter: 9000,
        })
      }
      return t.deps.fetch(input, init)
    }
    await using run = testCreateRun({
      ...t.deps,
      fetch,
      ...createCashuWalletDep({
        seed: deriveCashuWalletSeed(testCashuMasterKey),
        fetch,
      }),
    })

    const result = await run(claimCashuTopup(quote.operationId))

    expect(result.ok && result.value).toEqual({
      type: "claimedElsewhere",
      attemptId: null,
    })
    expect((await loadAttempts(t, quote)).map((a) => a.rejected)).toEqual([
      true,
    ])
  })

  describe("a mint that rotated its keyset", () => {
    /** The app started again: the wallet loads the mint's keysets afresh. */
    const restarted = (t: CashuTest) => ({
      ...t.deps,
      ...createCashuWalletDep({
        seed: deriveCashuWalletSeed(testCashuMasterKey),
        fetch: t.deps.fetch,
      }),
    })

    test("a quote made before the rotation is minted in the new keyset", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      const old = t.mint.keysetId
      t.mint.rotateKeyset()
      t.mint.payMintQuote(quote.quoteId)

      await using run = testCreateRun(restarted(t))
      const result = await run(claimCashuTopup(quote.operationId))

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      const attempts = await loadAttempts(t, quote)
      expect(attempts.map((attempt) => attempt.keysetId)).toEqual([
        t.mint.keysetId,
      ])
      expect(t.mint.keysetId).not.toBe(old)
    })

    test("a wallet loaded before the rotation claims in the new keyset on its next try, with no restart (cashu/0035)", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.rotateKeyset()
      t.mint.payMintQuote(quote.quoteId)

      const stale = await claim(t, quote)
      expect(!stale.ok && stale.error.type).toBe("MintUnreachable")
      const result = await claim(t, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
    })

    test("another device's lost claim in a keyset this wallet has not loaded is reclaimed (cashu/0035)", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      // This device's wallet is loaded; the mint rotates; another device
      // mints the quote in the new keyset and loses the answer.
      t.mint.rotateKeyset()
      t.mint.payMintQuote(quote.quoteId)
      const other = await t.otherDevice()
      const otherWallet = await other.cashuWallet.load(testMintUrl)
      await otherWallet.mintProofsBolt11(100, quote.quoteId, undefined, {
        type: "deterministic",
        counter: 5000,
      })
      await runMutationWithCompletion((options) =>
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          {
            operationId: quote.operationId,
            keysetId: t.mint.keysetId,
            counter: 5000,
            role: "mint",
          },
          options
        )
      )
      const [theirs] = await loadAttempts(t, quote)
      if (theirs === undefined) throw new Error("no attempt")

      await using run = testCreateRun(t.deps)
      const result = await run(
        claimCashuTopup(quote.operationId, { takeOver: theirs.id })
      )

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
    })

    test("a claim that never reached the mint before the rotation is not resumed in the old keyset", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      t.mint.failNext("mint", { type: "unreachable" })
      const failed = await claim(t, quote)
      expect(!failed.ok && failed.error.type).toBe("MintUnreachable")
      t.mint.rotateKeyset()

      await using run = testCreateRun(restarted(t))
      const result = await run(claimCashuTopup(quote.operationId))

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(100)
    })
  })

  describe("a block's claim ends on the mint's word (cashu/0029)", () => {
    /** This device's claim, signed at its block and the answer lost. */
    const lostClaim = async (t: CashuTest) => {
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      t.mint.failNext("mint", { type: "lostResponse" })
      const lost = await claim(t, quote)
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      const [own] = await loadAttempts(t, quote)
      if (own === undefined) throw new Error("no attempt")
      return { quote, counter: own.counter }
    }

    /**
     * Another device's receive of the token with an attempt at `counter`,
     * synced in; it never reached the mint from there.
     */
    const receiveElsewhereAt = async (
      t: CashuTest,
      text: CashuTokenText,
      counter: number
    ) => {
      const id = cashuReceiveOperationIdFor(text)
      await runMutationWithCompletion((options) => {
        upsertCashuOperationRow(
          t.deps.evolu,
          {
            id,
            kind: "receive",
            status: "pending",
            mintUrl: testMintUrl,
            amount: CashuAmount(8),
            keysetId: null,
          },
          options
        )
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          { operationId: id, keysetId: t.mint.keysetId, counter, role: "mint" },
          options
        )
        t.deps.evolu.upsert(
          "cashuReceive",
          { id, tokenText: text, fee: NonNegativeInteger(0) },
          options
        )
      })
      return id
    }

    const rejectedOf = async (
      t: CashuTest,
      operationId: Parameters<typeof cashuOperationAttemptsQuery>[0]
    ) =>
      (
        await t.deps.evolu.loadQuery(cashuOperationAttemptsQuery(operationId))
      ).map((row) => row.isRejected)

    test("a receive whose token is not spent gives the block to the topup", async () => {
      const { t } = await setup()
      await using _ = t
      const { quote, counter } = await lostClaim(t)
      const token = await createTestCashuCustomer(t).token(8)
      const receiveId = await receiveElsewhereAt(t, token.text, counter)

      const result = await claim(t, quote)

      expect(result.ok && result.value).toEqual({
        type: "claimed",
        amount: 100,
      })
      expect(await rejectedOf(t, receiveId)).toEqual([1])
    })

    test("a claim signed at a block the contested close never saw is reclaimed and booked by the device that made it (cashu/0029)", async () => {
      const { t } = await setup()
      await using _ = t
      // Earlier work moves this device's counter past the other device's:
      // a claim that never reached the mint leaves its slots reserved here
      // and unsigned, where the other device's first claim starts.
      await fundTestCashuWallet(t, 1000)
      const unsent = await quoteFor(t, 7)
      t.mint.payMintQuote(unsent.quoteId)
      t.mint.failNext("mint", { type: "unreachable" })
      expect((await claim(t, unsent)).ok).toBe(false)
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      // This device's claim never reaches the mint, and another operation's
      // reclaim contests its block.
      t.mint.failNext("mint", { type: "unreachable" })
      expect((await claim(t, quote)).ok).toBe(false)
      const [mine] = await loadAttempts(t, quote)
      if (mine === undefined) throw new Error("no attempt")
      await runMutationWithCompletion((options) =>
        t.deps.evolu.update(
          "cashuOperationAttempt",
          { id: mine.id, isContested: sqliteTrue },
          options
        )
      )
      // Another device claims at a block of its own; the mint signs, the
      // answer is lost, and that device's attempt never syncs here.
      const other = await t.otherDevice()
      await using otherRun = testCreateRun(other)
      await otherRun.ok(saveCashuAccount({ enabled: true }))
      await runMutationWithCompletion((options) =>
        upsertCashuTopupRows(other.evolu, quote, "payment", options)
      )
      t.mint.failNext("mint", { type: "lostResponse" })
      expect((await otherRun(claimCashuTopup(quote.operationId))).ok).toBe(
        false
      )

      // This device finds nothing of its own and closes it contested.
      const closed = await claim(t, quote)
      expect(closed.ok && closed.value).toEqual({ type: "contested" })
      // The close and the mark sync to the other device.
      await runMutationWithCompletion((options) => {
        updateCashuOperation(
          other.evolu,
          quote.operationId,
          { status: "done", settledAt: TimestampMs(Date.now()) },
          options
        )
        other.evolu.upsert(
          "cashuOperationAttempt",
          {
            id: mine.id,
            operationId: quote.operationId,
            keysetId: mine.keysetId,
            counter: NonNegativeInteger(mine.counter),
            role: mine.role,
            slots: NonNegativeInteger(mine.slots),
            isContested: sqliteTrue,
          },
          options
        )
      })
      expect(
        await other.evolu.loadQuery(contestedCashuTopupsWithOwnAttemptQuery)
      ).toEqual([{ id: quote.operationId }])
      const before = await testCashuBalance(other.evolu)

      expect(
        await otherRun.orThrow(reclaimContestedCashuTopup(quote.operationId))
      ).toBe(100)
      expect(await testCashuBalance(other.evolu)).toBe(before + 100)
      expect(
        await other.evolu.loadQuery(
          accountTransactionExistsQuery(
            deriveCashuAccountTransactionId(quote.operationId)
          )
        )
      ).toHaveLength(1)
      // Reclaimed once: a second pass stores and books nothing more.
      expect(
        await otherRun.orThrow(reclaimContestedCashuTopup(quote.operationId))
      ).toBe(0)
    })

    test("a contested topup's own block that holds nothing is refused by the reclaim, never scanned again (cashu/0029)", async () => {
      const { t } = await setup()
      await using _ = t
      const quote = await quoteFor(t)
      t.mint.payMintQuote(quote.quoteId)
      // Another device's claim never reaches the mint.
      const other = await t.otherDevice()
      await using otherRun = testCreateRun(other)
      await otherRun.ok(saveCashuAccount({ enabled: true }))
      await runMutationWithCompletion((options) =>
        upsertCashuTopupRows(other.evolu, quote, "payment", options)
      )
      t.mint.failNext("mint", { type: "unreachable" })
      expect((await otherRun(claimCashuTopup(quote.operationId))).ok).toBe(
        false
      )
      // A call at a block the other device never saw mints the quote (a
      // wallet of another seed stands in for it, so the counters stay
      // apart), and the topup's close as contested syncs in.
      const { wallet } = await createTestCashuCustomer(t).token(8)
      await wallet.mintProofsBolt11(100, quote.quoteId)
      await runMutationWithCompletion((options) => {
        updateCashuOperation(
          other.evolu,
          quote.operationId,
          { status: "done", settledAt: TimestampMs(Date.now()) },
          options
        )
        const contested = upsertTestCashuAttemptElsewhere(
          other.evolu,
          {
            operationId: quote.operationId,
            keysetId: t.mint.keysetId,
            counter: 9000,
            role: "mint",
          },
          options
        )
        other.evolu.update(
          "cashuOperationAttempt",
          { id: contested, isContested: sqliteTrue },
          options
        )
      })
      expect(
        await other.evolu.loadQuery(contestedCashuTopupsWithOwnAttemptQuery)
      ).toEqual([{ id: quote.operationId }])

      expect(
        await otherRun.orThrow(reclaimContestedCashuTopup(quote.operationId))
      ).toBe(0)
      expect(
        await other.evolu.loadQuery(contestedCashuTopupsWithOwnAttemptQuery)
      ).toEqual([])
    })

    test("a contest is ambiguous within the grace, and past it stored unbooked and refused for both", async () => {
      const { t } = await setup()
      await using _ = t
      const { quote, counter } = await lostClaim(t)
      // Linky spent the receive's token: both could have signed the block.
      const token = await createTestCashuCustomer(t).token(8)
      await token.wallet.receive(token.text)
      const receiveId = await receiveElsewhereAt(t, token.text, counter)

      const waiting = await claim(t, quote)

      expect(!waiting.ok && waiting.error.type).toBe("CashuReclaimAmbiguous")
      expect(await testCashuBalance(t.deps.evolu)).toBe(0)

      await using run = testCreateRun(t.deps)
      const settled = await run(
        claimCashuTopup(quote.operationId, { settleContest: true })
      )

      // Given to no one, the topup is closed unbooked (cashu/0029).
      expect(settled.ok && settled.value).toEqual({ type: "contested" })
      expect(await testCashuBalance(t.deps.evolu)).toBe(100)
      expect((await loadTopup(t, quote))?.status).toBe("done")
      expect(await rejectedOf(t, quote.operationId)).toEqual([1])
      expect(await rejectedOf(t, receiveId)).toEqual([1])
    })
  })

  describe("outputs in slots only an operation's block names are its own, stored or not (cashu/0038)", () => {
    const syncThrough = (url: string, ...evolus: ReadonlyArray<Evolu>) => {
      for (const evolu of evolus)
        evolu.useOwner(evolu.appOwner, [
          createOwnerWebSocketTransport({ url, ownerId: evolu.appOwner.id }),
        ])
    }

    test("a lost claim whose outputs another device's first-use restore stored is booked and closed, never left pending", async () => {
      await using relay = await createTestRelay()
      const { t } = await setup({ createWebSocket })
      await using _ = t
      await using run = testCreateRun(t.deps)
      await run.ok(saveCashuAccount({ enabled: true }))
      const lost = await quoteFor(t, 386)
      t.mint.payMintQuote(lost.quoteId)
      t.mint.failNext("mint", { type: "lostResponse" })
      const first = await claim(t, lost)
      expect(!first.ok && first.error.type).toBe("MintUnreachable")
      const [own] = await loadAttempts(t, lost)
      if (own === undefined) throw new Error("no attempt")

      // Another device claims a topup of its own. Its first use of the
      // keyset restores it, storing this device's outputs with no booking,
      // and its call starts past them.
      const other = await t.otherDevice()
      await using otherRun = testCreateRun(other)
      const elsewhere = await otherRun.orThrow(
        createCashuTopupQuote({
          mint: testMintUrl,
          amount: CashuAmount(135),
          purpose: "payment",
        })
      )
      t.mint.payMintQuote(elsewhere.quoteId)
      const claimed = await otherRun(claimCashuTopup(elsewhere.operationId))
      expect(claimed.ok && claimed.value).toEqual({
        type: "claimed",
        amount: 135,
      })

      syncThrough(relay.url, t.deps.evolu, other.evolu)
      const synced = async () => ({
        balance: await testCashuBalance(t.deps.evolu),
        operations: (await loadTestCashuOperations(t.deps.evolu)).map(
          (operation) => operation.status
        ),
        attempts: (
          await t.deps.evolu.loadQuery(
            cashuOperationAttemptsQuery(elsewhere.operationId)
          )
        ).length,
      })
      await expect
        .poll(synced, { timeout: 15_000, interval: 200 })
        .toEqual({ balance: 521, operations: ["pending", "done"], attempts: 1 })

      const reclaimed = await claim(t, lost)

      expect(reclaimed.ok && reclaimed.value).toEqual({
        type: "claimed",
        amount: 0,
      })
      expect((await loadTopup(t, lost))?.status).toBe("done")
      expect(
        await t.deps.evolu.loadQuery(
          accountTransactionExistsQuery(
            deriveCashuAccountTransactionId(lost.operationId)
          )
        )
      ).toHaveLength(1)
      expect(await testCashuBalance(t.deps.evolu)).toBe(521)
    }, 30_000)
  })
})
