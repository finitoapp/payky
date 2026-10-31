import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createCashuMintCache } from "../../cashu/cashu-mint-cache.ts"
import { createCashuWalletDep } from "../../cashu/cashu-wallet.ts"
import {
  createCashuTest,
  createTestCashuCustomer,
  fundTestCashuWallet,
  loadTestCashuOperations,
  loadTestCashuProofs,
  storeTestCashuProofs,
  testCashuBalance,
  testCashuMasterKey,
  testMintUrl,
  upsertTestCashuAttemptElsewhere,
} from "../../testing/cashu.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { deriveCashuWalletSeed } from "../shared/key-derivation.ts"
import { CASHU_OUTPUT_BLOCK } from "./cashu-counter-actions.ts"
import {
  type CashuAttempt,
  CLAIMED_ELSEWHERE_GRACE_MS,
  loadCashuAttempts,
  loadCashuMelt,
} from "./cashu-guards.ts"
import {
  meltCashu,
  prepareCashuMeltSwap,
  quoteCashuMelt,
  resumeCashuMelt,
} from "./cashu-melt-actions.ts"
import { spendCashuProofs, toWalletProofs } from "./cashu-proof-actions.ts"
import {
  availableCashuProofsAtMintQuery,
  heldCashuProofsOfOperationQuery,
  type StoredCashuProof,
} from "./cashu-queries.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "./cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuAttemptRole,
  type CashuOperationAttemptId,
  type CashuOperationId,
} from "./cashu-types.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

/** 50 sat: 500 nano-BTC. */
const invoice50 = "lnbc500n1pjfakeinvoice"

const setup = async (balance = 1000) => {
  const t = await createCashuTest()
  await fundTestCashuWallet(t, balance)
  return t
}

/**
 * The melt's inputs its pre-swap signed, as its sender holds them: the sent
 * outputs, first in the swap's slots (cashu/0039). The swap is prepared again
 * from the sources this device holds, to read how many slots they take.
 */
const preSwapInputs = async (
  t: CashuTest,
  operationId: CashuOperationId,
  preSwap: CashuAttempt
) => {
  const wallet = await (await t.otherDevice()).cashuWallet.load(testMintUrl)
  const sources = await t.deps.evolu.loadQuery(
    heldCashuProofsOfOperationQuery(operationId)
  )
  const prepared = await prepareCashuMeltSwap(wallet, {
    amount: 52,
    proofs: toWalletProofs(sources),
    keysetId: preSwap.keysetId,
    counter: preSwap.counter,
  })
  return (
    await wallet.restore(preSwap.counter, prepared.sendOutputs?.length ?? 0, {
      keysetId: preSwap.keysetId,
    })
  ).proofs
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

  test("a melt whose answer could not be read is asked again, never closed failed (cashu/0029)", async () => {
    await using t = await setup()
    // The mint pays, and its answer does not parse.
    t.mint.failNext("melt", { type: "garbledResponse" })

    const { result } = await melt(t)

    expect(result.ok && result.value).toMatchObject({ paidAmount: 50 })
    expect(t.mint.requestCount("melt")).toBe(1)
    expect(await testCashuBalance(t.deps.evolu)).toBe(950)
  })

  test("a pre-swap whose outputs were never stored is recovered from its reserved slots, nothing lost", async () => {
    await using t = await setup()
    const available = () =>
      t.deps.evolu.loadQuery(availableCashuProofsAtMintQuery(testMintUrl))
    const sources = await available()
    // The mint swaps the sources but the answer never comes back, as after a
    // crash before the outputs were stored; the immediate check cannot ask.
    t.mint.failNext("swap", { type: "lostResponse" })
    t.mint.failNext("checkstate", { type: "ok" })
    t.mint.failNext("checkstate", { type: "unreachable" })

    const { result } = await melt(t)
    expect(!result.ok && result.error.type).toBe("CashuMeltPending")
    if (result.ok || result.error.type !== "CashuMeltPending") return
    expect(sources.some((proof) => t.mint.isSpent(proof.secret))).toBe(true)

    await using run = testCreateRun(t.deps)
    const resumed = await run.orThrow(resumeCashuMelt(result.error.operationId))

    expect(resumed.type).toBe("unpaid")
    expect(t.mint.requestCount("melt")).toBe(0)
    expect(
      (await available()).filter((proof) => t.mint.isSpent(proof.secret))
    ).toEqual([])
    expect(
      (await loadTestCashuProofs(t.deps.evolu)).filter(
        (proof) => proof.state === "held"
      )
    ).toEqual([])
    expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
  })

  test("a pre-swap whose sources another device marked spent first is still recovered from its slots (cashu/0019)", async () => {
    await using t = await setup()
    t.mint.failNext("swap", { type: "lostResponse" })
    t.mint.failNext("checkstate", { type: "ok" })
    t.mint.failNext("checkstate", { type: "unreachable" })
    const { result } = await melt(t)
    if (result.ok || result.error.type !== "CashuMeltPending")
      throw new Error("not pending")
    const held = (await loadTestCashuProofs(t.deps.evolu)).filter(
      (proof) => proof.state === "held"
    )
    expect(held.length).toBeGreaterThan(0)
    // Another device's NUT-07 check saw the sources spent by this swap and
    // marked them so; that syncs in before the resume. The melt now holds
    // nothing the mint could report spent.
    await runMutationWithCompletion((options) =>
      spendCashuProofs(
        t.deps.evolu,
        held.map((proof) => proof.id),
        options
      )
    )

    await using run = testCreateRun(t.deps)
    const resumed = await run.orThrow(resumeCashuMelt(result.error.operationId))

    expect(resumed.type).toBe("unpaid")
    expect(t.mint.requestCount("melt")).toBe(0)
    expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
  })

  describe("a pre-swap whose answer was lost is fenced before its sources come back (cashu/0019)", () => {
    /** The melt's pre-swap, as its device prepared it, sent once more. */
    const sendPreSwap = async (
      t: CashuTest,
      operationId: CashuOperationId,
      sources: ReadonlyArray<StoredCashuProof>
    ) => {
      await using run = testCreateRun(t.deps)
      const preSwap = (await run.ok(loadCashuAttempts(operationId))).find(
        (attempt) => attempt.role === "meltSwap"
      )
      if (preSwap === undefined) throw new Error("no pre-swap")
      const wallet = await t.deps.cashuWallet.load(testMintUrl)
      return await wallet.completeSwap(
        await prepareCashuMeltSwap(wallet, {
          amount: 52,
          proofs: toWalletProofs(sources),
          keysetId: preSwap.keysetId,
          counter: preSwap.counter,
        })
      )
    }
    const heldOf = (t: CashuTest, operationId: CashuOperationId) =>
      t.deps.evolu.loadQuery(heldCashuProofsOfOperationQuery(operationId))
    const operationOf = async (t: CashuTest) => {
      const [melt] = (await loadTestCashuOperations(t.deps.evolu)).filter(
        (operation) => operation.kind === "melt"
      )
      if (melt === undefined) throw new Error("no melt")
      return melt
    }

    test("a pre-swap that reaches the mint after the fence is refused, nothing lost", async () => {
      await using t = await setup()
      // The pre-swap never reached the mint before the device gave up.
      t.mint.failNext("swap", { type: "unreachable" })
      // Its sources, as the melt held them when it was settled.
      let sources: ReadonlyArray<StoredCashuProof> = []
      t.mint.failNext("checkstate", { type: "ok" })
      t.mint.failNext("checkstate", {
        type: "then",
        run: async () => {
          sources = await heldOf(t, (await operationOf(t)).id)
        },
      })

      const { result } = await melt(t)

      expect(!result.ok && result.error.type).toBe("MintUnreachable")
      const operation = await operationOf(t)
      expect(operation.status).toBe("failed")
      expect(sources.length).toBeGreaterThan(0)
      // It reaches the mint now: the fence spent its sources.
      await expect(sendPreSwap(t, operation.id, sources)).rejects.toThrow()
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      expect(
        (
          await t.deps.evolu.loadQuery(
            availableCashuProofsAtMintQuery(testMintUrl)
          )
        ).filter((proof) => t.mint.isSpent(proof.secret))
      ).toEqual([])
    })

    test("a pre-swap that reaches the mint before the fence is restored from its slots", async () => {
      await using t = await setup()
      t.mint.failNext("swap", { type: "unreachable" })
      // The pre-swap lands right after its block was found empty.
      t.mint.failNext("restore", {
        type: "then",
        run: async () => {
          const operation = await operationOf(t)
          await sendPreSwap(t, operation.id, await heldOf(t, operation.id))
        },
      })

      const { result } = await melt(t)

      expect(!result.ok && result.error.type).toBe("CashuMeltPending")
      if (result.ok || result.error.type !== "CashuMeltPending") return
      await using run = testCreateRun(t.deps)
      const resumed = await run.orThrow(
        resumeCashuMelt(result.error.operationId)
      )

      expect(resumed.type).toBe("unpaid")
      expect(t.mint.requestCount("melt")).toBe(0)
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      expect(
        (
          await t.deps.evolu.loadQuery(
            availableCashuProofsAtMintQuery(testMintUrl)
          )
        ).filter((proof) => t.mint.isSpent(proof.secret))
      ).toEqual([])
    })

    test("a fence whose answer was lost leaves the melt pending, and the resume restores it", async () => {
      await using t = await setup()
      t.mint.failNext("swap", { type: "unreachable" })
      t.mint.failNext("swap", { type: "lostResponse" })

      const { result } = await melt(t)

      expect(!result.ok && result.error.type).toBe("CashuMeltPending")
      if (result.ok || result.error.type !== "CashuMeltPending") return
      const { operationId } = result.error
      expect(await heldOf(t, operationId)).not.toEqual([])
      await using run = testCreateRun(t.deps)
      const resumed = await run.orThrow(resumeCashuMelt(operationId))

      expect(resumed.type).toBe("unpaid")
      expect(t.mint.requestCount("swap")).toBe(2)
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      expect(
        (
          await t.deps.evolu.loadQuery(
            availableCashuProofsAtMintQuery(testMintUrl)
          )
        ).filter((proof) => t.mint.isSpent(proof.secret))
      ).toEqual([])
    })
  })

  describe("a melt whose quote states no expiry is fenced once a grace has passed (cashu/0027)", () => {
    /** A clock the test moves, and a mint whose melt quotes never expire. */
    const setupUnexpiring = async () => {
      const clock: { nowMs: number } = { nowMs: Date.now() }
      const t = await createCashuTest({
        now: () => clock.nowMs,
        mint: { meltQuotesExpire: false },
      })
      await fundTestCashuWallet(t, 1000)
      return { t, clock }
    }
    /** The melt's request, as its device sent it, reaching the mint now. */
    const sendMelt = async (
      t: CashuTest,
      operationId: CashuOperationId,
      inputs: ReadonlyArray<StoredCashuProof>
    ) => {
      await using run = testCreateRun(t.deps)
      const blanks = (await run.ok(loadCashuAttempts(operationId))).find(
        (attempt) => attempt.role === "meltChange"
      )
      const melted = await run.ok(loadCashuMelt(operationId))
      if (blanks === undefined || melted === null) throw new Error("no blanks")
      const wallet = await t.deps.cashuWallet.load(testMintUrl)
      return await wallet.meltProofsBolt11(
        await wallet.checkMeltQuoteBolt11(melted.quoteId),
        toWalletProofs(inputs),
        { keysetId: blanks.keysetId },
        { type: "deterministic", counter: blanks.counter }
      )
    }
    const heldOf = (t: CashuTest, operationId: CashuOperationId) =>
      t.deps.evolu.loadQuery(heldCashuProofsOfOperationQuery(operationId))
    /** A melt whose request never reached the mint before the check. */
    const sentUnanswered = async (t: CashuTest) => {
      t.mint.failNext("melt", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      return result.error.operationId
    }

    test("a lost request waits out the grace, then the fence returns the inputs and the late request is refused", async () => {
      const { t, clock } = await setupUnexpiring()
      await using _ = t
      const operationId = await sentUnanswered(t)
      const inputs = await heldOf(t, operationId)
      await using run = testCreateRun(t.deps)

      expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
        "pending"
      )
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
        "unpaid"
      )

      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      await expect(sendMelt(t, operationId, inputs)).rejects.toThrow()
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      expect(
        (
          await t.deps.evolu.loadQuery(
            availableCashuProofsAtMintQuery(testMintUrl)
          )
        ).filter((proof) => t.mint.isSpent(proof.secret))
      ).toEqual([])
    })

    test("a melt another device sent and left is fenced past the grace", async () => {
      const { t, clock } = await setupUnexpiring()
      await using _ = t
      const operationId = await sentUnanswered(t)
      const takeOver = async () => {
        await using run = testCreateRun(t.deps)
        return await run.orThrow(
          resumeCashuMelt(operationId, undefined, { takeOver: true })
        )
      }

      expect((await takeOver()).type).toBe("pending")
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      expect((await takeOver()).type).toBe("unpaid")
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
    })

    test("a request that reaches the mint before the fence is settled paid", async () => {
      const { t, clock } = await setupUnexpiring()
      await using _ = t
      const operationId = await sentUnanswered(t)
      const inputs = await heldOf(t, operationId)
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      // The held inputs read unspent; then the request lands, before the
      // fence: the mint refuses the fence.
      t.mint.failNext("checkstate", {
        type: "then",
        run: async () => {
          expect((await sendMelt(t, operationId, inputs)).quote.state).toBe(
            "PAID"
          )
        },
      })
      await using run = testCreateRun(t.deps)

      expect((await run(resumeCashuMelt(operationId))).ok).toBe(false)
      const resumed = await run.orThrow(resumeCashuMelt(operationId))

      expect(resumed.type === "paid" && resumed.receipt).toMatchObject({
        paidAmount: 50,
        totalSpent: 50,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(950)
    })
  })

  describe("a melt that may have gone out is closed unpaid only once its quote expired (cashu/0027)", () => {
    /** A melt whose request never reached the mint before the check. */
    const sentUnanswered = async (t: CashuTest) => {
      t.mint.failNext("melt", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      return result.error.operationId
    }
    const resume = async (t: CashuTest, operationId: CashuOperationId) => {
      await using run = testCreateRun(t.deps)
      return await run.orThrow(resumeCashuMelt(operationId))
    }

    test("UNPAID after a lost melt request keeps the inputs held", async () => {
      await using t = await setup()

      const operationId = await sentUnanswered(t)

      expect((await resume(t, operationId)).type).toBe("pending")
      await using run = testCreateRun(t.deps)
      expect(await run.ok(loadCashuMelt(operationId))).toMatchObject({
        status: "pending",
      })
      expect(
        await t.deps.evolu.loadQuery(
          heldCashuProofsOfOperationQuery(operationId)
        )
      ).not.toEqual([])
      expect(await testCashuBalance(t.deps.evolu)).toBeLessThan(1000)
    })

    test("a request that reaches the mint after the check is settled paid", async () => {
      await using t = await setup()
      const operationId = await sentUnanswered(t)
      expect((await resume(t, operationId)).type).toBe("pending")

      // The request the device gave up on reaches the mint now.
      await using run = testCreateRun(t.deps)
      const blanks = (await run.ok(loadCashuAttempts(operationId))).find(
        (attempt) => attempt.role === "meltChange"
      )
      const melted = await run.ok(loadCashuMelt(operationId))
      if (blanks === undefined || melted === null) throw new Error("no blanks")
      const wallet = await t.deps.cashuWallet.load(testMintUrl)
      const paid = await wallet.meltProofsBolt11(
        await wallet.checkMeltQuoteBolt11(melted.quoteId),
        toWalletProofs(
          await t.deps.evolu.loadQuery(
            heldCashuProofsOfOperationQuery(operationId)
          )
        ),
        { keysetId: blanks.keysetId },
        { type: "deterministic", counter: blanks.counter }
      )
      expect(paid.quote.state).toBe("PAID")

      const resumed = await resume(t, operationId)

      expect(resumed.type === "paid" && resumed.receipt).toMatchObject({
        paidAmount: 50,
        totalSpent: 50,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(950)
    })

    test("once the quote expired, the inputs come back", async () => {
      let nowMs: number = Date.now()
      await using t = await createCashuTest({ now: () => nowMs })
      await fundTestCashuWallet(t, 1000)
      const operationId = await sentUnanswered(t)
      expect((await resume(t, operationId)).type).toBe("pending")

      nowMs += 600_000 + CLAIMED_ELSEWHERE_GRACE_MS + 1

      expect((await resume(t, operationId)).type).toBe("unpaid")
      expect(t.mint.requestCount("melt")).toBe(1)
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
    })
  })

  describe("a melt request refused with an answer that says it may be paying is settled on the quote's state (cashu/0027)", () => {
    test.each([
      ["the quote pending", 20005, "Quote is pending."],
      ["the proofs pending", 11002, "Proofs are pending."],
      ["the invoice already paid", 20006, "Invoice already paid."],
      [
        "another refusal while the mint holds the inputs pending",
        11005,
        "Transaction is not balanced (inputs != outputs)",
      ],
    ])(
      "%s: the inputs stay held, and the melt is paid with its change once the original lands",
      async (_, code, detail) => {
        await using t = await setup()
        // The original request is being paid; this copy is refused.
        t.mint.failNext("melt", { type: "deferred", answer: { code, detail } })

        const { result } = await melt(t)

        expect(!result.ok && result.error.type).toBe("CashuMeltPending")
        if (result.ok || result.error.type !== "CashuMeltPending") return
        const { operationId } = result.error
        await using run = testCreateRun(t.deps)
        expect(await run.ok(loadCashuMelt(operationId))).toMatchObject({
          status: "pending",
        })
        expect(
          await t.deps.evolu.loadQuery(
            heldCashuProofsOfOperationQuery(operationId)
          )
        ).not.toEqual([])
        expect(await testCashuBalance(t.deps.evolu)).toBeLessThan(950)
        expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
          "pending"
        )

        const [held] = t.mint.deferredRequests()
        expect(t.mint.deliverDeferred(held?.id ?? -1)).toEqual({ ok: true })
        const resumed = await run.orThrow(resumeCashuMelt(operationId))

        expect(resumed.type === "paid" && resumed.receipt).toMatchObject({
          paidAmount: 50,
          changeAmount: 2,
          totalSpent: 50,
        })
        expect(t.mint.requestCount("melt")).toBe(1)
        expect(await testCashuBalance(t.deps.evolu)).toBe(950)
      }
    )
  })

  describe("a quote is melted once, whichever device settles it (cashu/0041)", () => {
    /** The same quote melted again, as a second confirm would. */
    const meltAgain = async (
      t: CashuTest,
      cost: { readonly quoteId: string; readonly maxTotal: number }
    ) => {
      await using run = testCreateRun(t.deps)
      return await run(
        meltCashu({
          mint: testMintUrl,
          invoice: invoice50,
          quoteId: cost.quoteId,
          maxTotal: cost.maxTotal,
          purpose: "withdrawal",
        })
      )
    }
    const heldIds = async (t: CashuTest, operationId: CashuOperationId) =>
      (
        await t.deps.evolu.loadQuery(
          heldCashuProofsOfOperationQuery(operationId)
        )
      )
        .map((proof) => proof.id)
        .toSorted()

    test("a quote whose melt is pending is not sent again: the second call leaves it to the resume", async () => {
      await using t = await setup()
      // The request never reached the mint, so its quote is still payable.
      t.mint.failNext("melt", { type: "unreachable" })
      const { cost, result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      const held = await heldIds(t, operationId)
      const swaps = t.mint.requestCount("swap")

      const again = await meltAgain(t, cost)

      expect(!again.ok && again.error).toMatchObject({
        type: "CashuMeltPending",
        operationId,
      })
      expect(t.mint.requestCount("melt")).toBe(1)
      expect(t.mint.requestCount("swap")).toBe(swaps)
      expect(await heldIds(t, operationId)).toEqual(held)
    })

    test("a melt another device took over and closed unpaid, its quote still payable, is not sent again by its sender", async () => {
      const clock: { nowMs: number } = { nowMs: Date.now() }
      await using t = await createCashuTest({
        now: () => clock.nowMs,
        mint: { meltQuotesExpire: false },
      })
      await fundTestCashuWallet(t, 1000)
      t.mint.failNext("melt", { type: "unreachable" })
      const { cost, result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      // Another device fences the melt past the grace and closes it; its
      // rows reach the sender.
      await using run = testCreateRun(t.deps)
      expect(
        (
          await run.orThrow(
            resumeCashuMelt(operationId, undefined, { takeOver: true })
          )
        ).type
      ).toBe("pending")
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      expect(
        (
          await run.orThrow(
            resumeCashuMelt(operationId, undefined, { takeOver: true })
          )
        ).type
      ).toBe("unpaid")

      const again = await meltAgain(t, cost)

      expect(!again.ok && again.error.type).toBe("CashuMeltUnpaid")
      expect(t.mint.requestCount("melt")).toBe(1)
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
    })

    test("two calls at once on one device send one melt", async () => {
      await using t = await setup()
      await using run = testCreateRun(t.deps)
      const cost = await run.orThrow(
        quoteCashuMelt({ mint: testMintUrl, invoice: invoice50 })
      )

      const results = await Promise.all([
        meltAgain(t, cost),
        meltAgain(t, cost),
      ])

      expect(results.filter((result) => result.ok)).toHaveLength(1)
      expect(t.mint.requestCount("melt")).toBe(1)
      expect(await testCashuBalance(t.deps.evolu)).toBe(950)
    })
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

  describe("a melt holds only what covers it, chosen under the lock (cashu/0026)", () => {
    test("a melt left pending holds the proofs that cover it, the rest stays spendable", async () => {
      await using t = await setup()
      // The swap's answer is lost and the mint cannot be asked about it.
      t.mint.failNext("swap", { type: "lostResponse" })
      t.mint.failNext("checkstate", { type: "ok" })
      t.mint.failNext("checkstate", { type: "unreachable" })

      const { result } = await melt(t)

      expect(!result.ok && result.error.type).toBe("CashuMeltPending")
      const held = (await loadTestCashuProofs(t.deps.evolu)).filter(
        (proof) => proof.state === "held"
      )
      const heldTotal = held.reduce(
        (sum, proof) => sum + (proof.amount ?? 0),
        0
      )
      expect(heldTotal).toBeGreaterThanOrEqual(52)
      expect(heldTotal).toBeLessThan(1000)
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000 - heldTotal)
    })

    test("a pre-swap refused because another device's melt spent its sources first closes the melt, never left pending (cashu/0019)", async () => {
      await using t = await setup()
      // Right after the melt read its sources unspent, another device's
      // melt, started at once and holding the same proofs, pre-swaps them at
      // a block of its own; none of its rows reach this device.
      const other = await (await t.otherDevice()).cashuWallet.load(testMintUrl)
      t.mint.failNext("checkstate", {
        type: "then",
        run: async () => {
          await other.completeSwap(
            await other.prepareSwapToReceive(
              toWalletProofs(
                await t.deps.evolu.loadQuery(
                  availableCashuProofsAtMintQuery(testMintUrl)
                )
              ),
              { keysetId: t.mint.keysetId },
              { type: "deterministic", counter: 9000 }
            )
          )
        },
      })

      const { result } = await melt(t)

      expect(!result.ok && result.error.type).toBe("MintRejected")
      const [operation] = (await loadTestCashuOperations(t.deps.evolu)).filter(
        (row) => row.kind === "melt"
      )
      expect(operation?.status).toBe("failed")
      expect(t.mint.requestCount("melt")).toBe(0)
      const proofs = await loadTestCashuProofs(t.deps.evolu)
      expect(proofs.filter((proof) => proof.state === "held")).toEqual([])
      expect(proofs.some((proof) => proof.state === "spent")).toBe(true)
      expect(
        proofs.filter(
          (proof) =>
            proof.state === "spent" && !t.mint.isSpent(proof.secret ?? "")
        )
      ).toEqual([])
    })

    test("two melts started together from one mint each pay, neither taking the other's proofs", async () => {
      await using t = await setup()
      await using run = testCreateRun(t.deps)
      const pay = async (invoice: string) => {
        const cost = await run.orThrow(
          quoteCashuMelt({ mint: testMintUrl, invoice })
        )
        return run(
          meltCashu({
            mint: testMintUrl,
            invoice,
            quoteId: cost.quoteId,
            maxTotal: cost.maxTotal,
            purpose: "withdrawal",
          })
        )
      }

      const results = await Promise.all([
        pay(invoice50),
        pay("lnbc500n1pjotherinvoice"),
      ])

      expect(results.map((result) => result.ok)).toEqual([true, true])
      expect(await testCashuBalance(t.deps.evolu)).toBe(900)
    })
  })

  describe("a melt its sender left is settled only on the mint's final answer (cashu/0027)", () => {
    test("PAID is settled, the change restored from the blanks' block, nothing sent again", async () => {
      await using t = await setup()
      t.mint.failNext("melt", { type: "lostResponse" })
      t.mint.failNext("checkMeltQuote", { type: "ok" })
      t.mint.failNext("checkMeltQuote", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const meltsBefore = t.mint.requestCount("melt")

      await using run = testCreateRun(t.deps)
      const resumed = await run.orThrow(
        resumeCashuMelt(result.error.operationId, undefined, {
          takeOver: true,
        })
      )

      expect(resumed.type).toBe("paid")
      expect(t.mint.requestCount("melt")).toBe(meltsBefore)
      expect(await testCashuBalance(t.deps.evolu)).toBe(950)
    })

    test("PAID whose sender's later writes never synced in: the swap's kept outputs come back and only what left is booked (cashu/0027)", async () => {
      await using t = await setup()
      // This device knows the melt as written before its pre-swap: the
      // sources held, `inputsTotal` their total, the swap's block reserved.
      t.mint.failNext("swap", { type: "lostResponse" })
      t.mint.failNext("checkstate", { type: "ok" })
      t.mint.failNext("checkstate", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      const heldTotal = (await loadTestCashuProofs(t.deps.evolu))
        .filter((proof) => proof.state === "held")
        .reduce((sum, proof) => sum + (proof.amount ?? 0), 0)

      // The sender stored the swap's outputs and sent the melt with its
      // blanks at a block of its own; none of that synced in.
      await using run = testCreateRun(t.deps)
      const attempts = await run.ok(loadCashuAttempts(operationId))
      const preSwap = attempts.find((attempt) => attempt.role === "meltSwap")
      const melted = await run.ok(loadCashuMelt(operationId))
      if (preSwap === undefined || melted === null)
        throw new Error("no pre-swap")
      const sender = await (await t.otherDevice()).cashuWallet.load(testMintUrl)
      const inputs = await preSwapInputs(t, operationId, preSwap)
      const blanks = preSwap.counter + preSwap.slots
      await runMutationWithCompletion((options) =>
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          {
            operationId,
            keysetId: preSwap.keysetId,
            counter: blanks,
            role: "meltChange",
          },
          options
        )
      )
      const paid = await sender.meltProofsBolt11(
        await sender.checkMeltQuoteBolt11(melted.quoteId),
        inputs,
        { keysetId: preSwap.keysetId },
        { type: "deterministic", counter: blanks }
      )
      expect(paid.quote.state).toBe("PAID")

      const resumed = await run.orThrow(
        resumeCashuMelt(operationId, undefined, { takeOver: true })
      )

      expect(heldTotal).toBeGreaterThan(52)
      expect(resumed.type === "paid" && resumed.receipt).toMatchObject({
        changeAmount: 2,
        totalSpent: 50,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(950)
    })

    test("UNPAID is left to the sender until the quote expired, then the proofs come back", async () => {
      let nowMs: number = Date.now()
      await using t = await createCashuTest({ now: () => nowMs })
      await fundTestCashuWallet(t, 1000)
      // The sender's swap answer is lost before it could send the melt.
      t.mint.failNext("swap", { type: "lostResponse" })
      t.mint.failNext("checkstate", { type: "ok" })
      t.mint.failNext("checkstate", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      const takeOver = async () => {
        await using run = testCreateRun(t.deps)
        return await run.orThrow(
          resumeCashuMelt(operationId, undefined, {
            takeOver: true,
          })
        )
      }

      expect((await takeOver()).type).toBe("pending")
      expect(await testCashuBalance(t.deps.evolu)).toBeLessThan(1000)

      nowMs += 600_000 + CLAIMED_ELSEWHERE_GRACE_MS + 1
      expect((await takeOver()).type).toBe("unpaid")
      expect(t.mint.requestCount("melt")).toBe(0)
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
    })
  })

  describe("a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027)", () => {
    /** A clock the test moves, and a mint whose melt quotes never expire. */
    const setupUnexpiring = async (startMs: number = Date.now()) => {
      const clock: { nowMs: number } = { nowMs: startMs }
      const t = await createCashuTest({
        now: () => clock.nowMs,
        mint: { meltQuotesExpire: false },
      })
      await fundTestCashuWallet(t, 1000)
      return { t, clock }
    }
    const heldOf = (t: CashuTest, operationId: CashuOperationId) =>
      t.deps.evolu.loadQuery(heldCashuProofsOfOperationQuery(operationId))
    const blockOf = async (
      t: CashuTest,
      operationId: CashuOperationId,
      role: CashuAttemptRole
    ) => {
      await using run = testCreateRun(t.deps)
      const block = (await run.ok(loadCashuAttempts(operationId))).find(
        (attempt) => attempt.role === role
      )
      if (block === undefined) throw new Error("no block")
      return block
    }
    /** A melt whose request never reached the mint before the check. */
    const sentUnanswered = async (t: CashuTest) => {
      t.mint.failNext("melt", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      return result.error.operationId
    }
    /** The melt request, as its sender prepared it, reaching the mint now. */
    const sendMelt = async (
      t: CashuTest,
      operationId: CashuOperationId,
      inputs: ReadonlyArray<Parameters<typeof toWalletProofs>[0][number]>,
      blanks: number
    ) => {
      await using run = testCreateRun(t.deps)
      const melted = await run.ok(loadCashuMelt(operationId))
      if (melted === null) throw new Error("no melt")
      const wallet = await t.deps.cashuWallet.load(testMintUrl)
      return await wallet.meltProofsBolt11(
        await wallet.checkMeltQuoteBolt11(melted.quoteId),
        toWalletProofs(inputs),
        { keysetId: t.mint.keysetId },
        { type: "deterministic", counter: blanks }
      )
    }
    const availableSpent = async (t: CashuTest) =>
      (
        await t.deps.evolu.loadQuery(
          availableCashuProofsAtMintQuery(testMintUrl)
        )
      ).filter((proof) => t.mint.isSpent(proof.secret))

    test("a fence another device made, its attempt not synced in yet, keeps the melt pending until it is, nothing lost (cashu/0019)", async () => {
      const { t, clock } = await setupUnexpiring()
      await using _ = t
      const operationId = await sentUnanswered(t)
      const inputs = await heldOf(t, operationId)
      // Another device took the melt over and fenced its inputs at a block
      // of its own; neither its answer nor its attempt reached this device.
      const fenceAt = 9000
      const other = await (await t.otherDevice()).cashuWallet.load(testMintUrl)
      await other.completeSwap(
        await other.prepareSwapToSend(
          inputs.reduce((sum, proof) => sum + proof.amount, 0),
          toWalletProofs(inputs),
          { keysetId: t.mint.keysetId },
          {
            send: { type: "deterministic", counter: fenceAt },
            keep: {
              type: "deterministic",
              counter: fenceAt + CASHU_OUTPUT_BLOCK,
            },
          }
        )
      )
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      await using run = testCreateRun(t.deps)

      expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
        "pending"
      )
      // The fence's attempt syncs in.
      await runMutationWithCompletion((options) =>
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          {
            operationId,
            keysetId: t.mint.keysetId,
            counter: fenceAt,
            role: "meltSwap",
            slots: 2 * CASHU_OUTPUT_BLOCK,
          },
          options
        )
      )
      expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
        "unpaid"
      )
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      expect(await availableSpent(t)).toEqual([])
    })

    test("a device holding only the melt's first batch fences the pre-swap's outputs, so the sender's late request is refused (cashu/0027)", async () => {
      const { t, clock } = await setupUnexpiring()
      await using _ = t
      // This device knows the melt as written before its pre-swap: the
      // sources held, the swap's block reserved; the swap's outputs, which
      // its sender holds as the melt's inputs, never synced in.
      t.mint.failNext("swap", { type: "lostResponse" })
      t.mint.failNext("checkstate", { type: "ok" })
      t.mint.failNext("checkstate", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      const preSwap = await blockOf(t, operationId, "meltSwap")
      const inputs = await preSwapInputs(t, operationId, preSwap)
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      await using run = testCreateRun(t.deps)

      const resumed = await run.orThrow(
        resumeCashuMelt(operationId, undefined, { takeOver: true })
      )

      expect(resumed.type).toBe("unpaid")
      // The sender's request, on its way all along, reaches the mint now.
      await expect(
        sendMelt(
          t,
          operationId,
          inputs.map((proof) => ({
            keysetId: proof.id,
            amount: Number(proof.amount),
            secret: proof.secret,
            c: proof.C,
          })),
          preSwap.counter + preSwap.slots
        )
      ).rejects.toThrow()
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      expect(await availableSpent(t)).toEqual([])
    })

    test("a pre-swap block another call signed in part is fenced while its first slot is unsigned (cashu/0019)", async () => {
      await using t = await setup()
      const operationOf = async () => {
        const [found] = (await loadTestCashuOperations(t.deps.evolu)).filter(
          (operation) => operation.kind === "melt"
        )
        if (found === undefined) throw new Error("no melt")
        return found.id
      }
      const stray = await createTestCashuCustomer(t).token(8)
      // The pre-swap never reached the mint before the device gave up, and
      // the settlement's check could not tell what it did.
      t.mint.failNext("swap", { type: "unreachable" })
      t.mint.failNext("checkstate", { type: "ok" })
      t.mint.failNext("checkstate", { type: "unreachable" })

      const { result } = await melt(t)

      expect(!result.ok && result.error.type).toBe("CashuMeltPending")
      const operationId = await operationOf()
      const sources = await heldOf(t, operationId)
      expect(sources.length).toBeGreaterThan(0)
      const preSwap = await blockOf(t, operationId, "meltSwap")
      // Before the resume reads the block, another call signs outputs inside
      // it, past its first slot.
      expect(preSwap.slots).toBeGreaterThan(1)
      const other = await (await t.otherDevice()).cashuWallet.load(testMintUrl)
      await other.completeSwap(
        await other.prepareSwapToSend(
          8,
          stray.proofs,
          { keysetId: preSwap.keysetId },
          {
            send: { type: "deterministic", counter: preSwap.counter + 1 },
            keep: {
              type: "deterministic",
              counter: preSwap.counter + preSwap.slots,
            },
          }
        )
      )
      await using run = testCreateRun(t.deps)

      expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
        "unpaid"
      )
      // The pre-swap reaches the mint now: the fence spent its sources.
      const wallet = await t.deps.cashuWallet.load(testMintUrl)
      await expect(
        (async () =>
          wallet.completeSwap(
            await prepareCashuMeltSwap(wallet, {
              amount: 52,
              proofs: toWalletProofs(sources),
              keysetId: preSwap.keysetId,
              counter: preSwap.counter,
            })
          ))()
      ).rejects.toThrow()
      expect(await availableSpent(t)).toEqual([])
    })

    test("a melt request refused because another device's fence spent its inputs never lets them go as available (cashu/0027)", async () => {
      await using t = await setup()
      const operationOf = async () => {
        const [found] = (await loadTestCashuOperations(t.deps.evolu)).filter(
          (operation) => operation.kind === "melt"
        )
        if (found === undefined) throw new Error("no melt")
        return found.id
      }
      // Right after the pre-swap, another device's fence swaps the melt's
      // inputs away at a block of its own.
      t.mint.failNext("swap", {
        type: "then",
        run: async () => {
          const operationId = await operationOf()
          const preSwap = await blockOf(t, operationId, "meltSwap")
          const other = await (await t.otherDevice()).cashuWallet.load(
            testMintUrl
          )
          const inputs = await preSwapInputs(t, operationId, preSwap)
          await other.completeSwap(
            await other.prepareSwapToSend(
              inputs.reduce((sum, proof) => sum + Number(proof.amount), 0),
              inputs,
              { keysetId: preSwap.keysetId },
              {
                send: { type: "deterministic", counter: 9000 },
                keep: { type: "deterministic", counter: 9100 },
              }
            )
          )
        },
      })

      const { result } = await melt(t)

      expect(result.ok).toBe(false)
      expect(t.mint.requestCount("melt")).toBe(1)
      expect(await availableSpent(t)).toEqual([])
      expect(
        (await loadTestCashuOperations(t.deps.evolu)).find(
          (operation) => operation.kind === "melt"
        )?.status
      ).toBe("failed")
    })

    /**
     * A melt whose pre-swap signed, its answer lost, and a fence another
     * device sent at `fence`, its answer lost too: only its attempt synced
     * in. `sendFence` is that fence reaching the mint.
     */
    const preSwapFencedElsewhere = async (
      t: CashuTest,
      fence: (preSwap: { readonly counter: number }) => {
        readonly counter: number
      }
    ) => {
      t.mint.failNext("swap", { type: "lostResponse" })
      t.mint.failNext("checkstate", { type: "ok" })
      t.mint.failNext("checkstate", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      const preSwap = await blockOf(t, operationId, "meltSwap")
      const { counter } = fence(preSwap)
      const fenceAt = { keysetId: t.mint.keysetId, counter }
      await runMutationWithCompletion((options) =>
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          {
            operationId,
            ...fenceAt,
            role: "meltSwap",
            slots: 2 * CASHU_OUTPUT_BLOCK,
          },
          options
        )
      )
      const sendFence = async () => {
        const other = await (await t.otherDevice()).cashuWallet.load(
          testMintUrl
        )
        const inputs = (
          await other.restore(preSwap.counter, preSwap.slots, {
            keysetId: preSwap.keysetId,
          })
        ).proofs
        return await other.completeSwap(
          await other.prepareSwapToReceive(
            inputs,
            { keysetId: fenceAt.keysetId },
            { type: "deterministic", counter: fenceAt.counter }
          )
        )
      }
      return { operationId, sendFence }
    }

    test("a pre-swap's outputs a fence still on its way may spend are swapped again before they come back (cashu/0019)", async () => {
      await using t = await setup()
      const { operationId, sendFence } = await preSwapFencedElsewhere(
        t,
        (preSwap) => ({ counter: preSwap.counter + 4 * CASHU_OUTPUT_BLOCK })
      )
      await using run = testCreateRun(t.deps)

      expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
        "unpaid"
      )
      await expect(sendFence()).rejects.toThrow()
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      expect(await availableSpent(t)).toEqual([])
    })

    test("a fence on its way in a keyset the mint rotated to may spend outputs of any block of the old one, whatever its counter (cashu/0019)", async () => {
      await using t = await setup()
      const { operationId, sendFence } = await preSwapFencedElsewhere(t, () => {
        t.mint.rotateKeyset()
        return { counter: 0 }
      })
      await using run = testCreateRun(t.deps)

      // A wallet loaded before the rotation learns of it from the refusal.
      const first = await run(resumeCashuMelt(operationId))
      const resumed = first.ok ? first : await run(resumeCashuMelt(operationId))

      expect(resumed.ok && resumed.value.type).toBe("unpaid")
      await expect(sendFence()).rejects.toThrow()
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
      expect(await availableSpent(t)).toEqual([])
    })

    test("a melt made before the mint rotated its keyset is fenced in the new one (cashu/0019)", async () => {
      const { t, clock } = await setupUnexpiring()
      await using _ = t
      const operationId = await sentUnanswered(t)
      t.mint.rotateKeyset()
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      await using run = testCreateRun(t.deps)

      // A wallet loaded before the rotation learns of it from the refusal.
      const first = await run(resumeCashuMelt(operationId))
      const resumed = first.ok ? first : await run(resumeCashuMelt(operationId))

      expect(resumed.ok && resumed.value.type).toBe("unpaid")
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
    })

    test("a fence swaps every source, even one worth no more than its fee, and books none spent the mint holds unspent (cashu/0019)", async () => {
      // Every proof costs a sat to spend, so a 1-sat input of the melt is
      // worth nothing to a swap that could leave it out.
      const clock: { nowMs: number } = { nowMs: Date.now() }
      await using t = await createCashuTest({
        now: () => clock.nowMs,
        mint: { meltQuotesExpire: false, inputFeePpk: 1000 },
      })
      await fundTestCashuWallet(t, 1000)
      await using run = testCreateRun(t.deps)
      // 49 sat: the melt's inputs include a 1-sat proof.
      const invoice49 = "lnbc490n1pjfakeinvoice"
      const cost = await run.orThrow(
        quoteCashuMelt({ mint: testMintUrl, invoice: invoice49 })
      )
      t.mint.failNext("melt", { type: "unreachable" })
      const result = await run(
        meltCashu({
          mint: testMintUrl,
          invoice: invoice49,
          quoteId: cost.quoteId,
          maxTotal: cost.maxTotal,
          purpose: "withdrawal",
        })
      )
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      expect(
        (await heldOf(t, operationId)).map((proof) => proof.amount)
      ).toContain(1)
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000

      expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
        "unpaid"
      )

      const proofs = await loadTestCashuProofs(t.deps.evolu)
      expect(
        proofs.filter(
          (proof) =>
            proof.state === "spent" && !t.mint.isSpent(proof.secret ?? "")
        )
      ).toEqual([])
      expect(await testCashuBalance(t.deps.evolu)).toBe(
        proofs
          .filter((proof) => !t.mint.isSpent(proof.secret ?? ""))
          .reduce((sum, proof) => sum + (proof.amount ?? 0), 0)
      )
    })

    test("the grace before a fence counts from when the melt was first seen, whatever the sender's clock says (cashu/0027)", async () => {
      // This device's clock is six hours behind the sender's, which wrote
      // the melt's `createdAt`.
      const { t, clock } = await setupUnexpiring(Date.now() - 6 * 3_600_000)
      await using _ = t
      const operationId = await sentUnanswered(t)
      const firstSeenMs = clock.nowMs
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      await using run = testCreateRun(t.deps)

      const resumed = await run.orThrow(
        resumeCashuMelt(operationId, undefined, {
          pendingSinceMs: firstSeenMs,
        })
      )

      expect(resumed.type).toBe("unpaid")
      expect(await testCashuBalance(t.deps.evolu)).toBe(1000)
    })
  })

  describe("what a melt costs (cashu/0023)", () => {
    test("the input fee is that of the proofs the pre-swap selects, never of every proof the mint holds", async () => {
      await using t = await createCashuTest({ mint: { inputFeePpk: 100 } })
      // Many proofs, eight for each 255 sat: a fee on each of them would
      // outgrow what the melt spends.
      for (let i = 0; i < 4; i++) await fundTestCashuWallet(t, 255)
      await using run = testCreateRun(t.deps)
      const available = await t.deps.evolu.loadQuery(
        availableCashuProofsAtMintQuery(testMintUrl)
      )

      const cost = await run.orThrow(
        quoteCashuMelt({ mint: testMintUrl, invoice: invoice50 })
      )

      // The melt's own fee is 1 sat; every proof's would be 4 more.
      expect(available.length).toBe(32)
      expect(cost.inputFee).toBeLessThan(1 + Math.ceil(available.length / 10))
      const paid = await run(
        meltCashu({
          mint: testMintUrl,
          invoice: invoice50,
          quoteId: cost.quoteId,
          maxTotal: cost.maxTotal,
          purpose: "withdrawal",
        })
      )
      expect(paid.ok && paid.value.totalSpent).toBeLessThanOrEqual(
        cost.maxTotal
      )
    })

    test("a proof synced in at a keyset this wallet has not loaded is priced, not thrown on (cashu/0035)", async () => {
      await using t = await createCashuTest()
      await fundTestCashuWallet(t, 1000)
      // This device's wallet knows the first keyset only; the next proofs
      // come at the one the mint rotated to, from another device.
      await t.deps.cashuWallet.load(testMintUrl)
      t.mint.rotateKeyset()
      const other = await t.otherDevice()
      await using otherRun = testCreateRun(other)
      const quote = await otherRun.orThrow(
        createCashuTopupQuote({
          mint: testMintUrl,
          amount: CashuAmount(500),
          purpose: "move",
        })
      )
      t.mint.payMintQuote(quote.quoteId)
      await otherRun.orThrow(claimCashuTopup(quote.operationId))
      const synced = (
        await other.evolu.loadQuery(
          availableCashuProofsAtMintQuery(testMintUrl)
        )
      ).filter((proof) => proof.keysetId === t.mint.keysetId)
      expect(synced.length).toBeGreaterThan(0)
      await storeTestCashuProofs(t.deps.evolu, synced)

      await using run = testCreateRun(t.deps)
      const cost = await run(
        quoteCashuMelt({ mint: testMintUrl, invoice: invoice50 })
      )

      expect(cost.ok).toBe(true)
    })
  })

  describe("what a melt books is what left the balance (cashu/0027)", () => {
    test("a melt books what left the balance, the pre-swap's input fee included", async () => {
      await using t = await createCashuTest({ mint: { inputFeePpk: 100 } })
      await fundTestCashuWallet(t, 1000)

      const { result } = await melt(t)

      const left = 1000 - (await testCashuBalance(t.deps.evolu))
      expect(left).toBeGreaterThan(50)
      expect(result.ok && result.value.totalSpent).toBe(left)
    })

    test("a melt settled by a resume that never saw its pre-swap's batch books the same", async () => {
      await using t = await createCashuTest({ mint: { inputFeePpk: 100 } })
      await fundTestCashuWallet(t, 1000)
      // This device knows the melt as written before its pre-swap.
      t.mint.failNext("swap", { type: "lostResponse" })
      t.mint.failNext("checkstate", { type: "ok" })
      t.mint.failNext("checkstate", { type: "unreachable" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error

      // The sender stored the swap's outputs and sent the melt with its
      // blanks at a block of its own; none of that synced in.
      await using run = testCreateRun(t.deps)
      const attempts = await run.ok(loadCashuAttempts(operationId))
      const preSwap = attempts.find((attempt) => attempt.role === "meltSwap")
      const melted = await run.ok(loadCashuMelt(operationId))
      if (preSwap === undefined || melted === null)
        throw new Error("no pre-swap")
      const sender = await (await t.otherDevice()).cashuWallet.load(testMintUrl)
      const inputs = await preSwapInputs(t, operationId, preSwap)
      const blanks = preSwap.counter + preSwap.slots
      await runMutationWithCompletion((options) =>
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          {
            operationId,
            keysetId: preSwap.keysetId,
            counter: blanks,
            role: "meltChange",
          },
          options
        )
      )
      const paid = await sender.meltProofsBolt11(
        await sender.checkMeltQuoteBolt11(melted.quoteId),
        inputs,
        { keysetId: preSwap.keysetId },
        { type: "deterministic", counter: blanks }
      )
      expect(paid.quote.state).toBe("PAID")

      const resumed = await run.orThrow(
        resumeCashuMelt(operationId, undefined, { takeOver: true })
      )

      const left = 1000 - (await testCashuBalance(t.deps.evolu))
      expect(left).toBeGreaterThan(50)
      expect(resumed.type === "paid" && resumed.receipt.totalSpent).toBe(left)
    })
  })

  describe("a melt derives its outputs in the keyset the mint signs with now (cashu/0040)", () => {
    test("a wallet loaded from an earlier session's snapshot, its refresh failed, refreshes before the pre-swap", async () => {
      await using t = await createCashuTest()
      await fundTestCashuWallet(t, 1000)
      const mintCache = createCashuMintCache(t.deps.evolu)
      const session = () =>
        createCashuWalletDep({
          seed: deriveCashuWalletSeed(testCashuMasterKey),
          fetch: t.deps.fetch,
          mintCache,
        })
      await session().cashuWallet.load(testMintUrl)
      await expect
        .poll(async () => (await mintCache.read(testMintUrl)) !== null)
        .toBe(true)
      // The mint rotates between sessions, and the next session's refresh
      // behind its cached wallet does not get through.
      t.mint.rotateKeyset()
      t.mint.failNext("info", { type: "unreachable" })
      t.mint.failNext("keysets", { type: "unreachable" })
      const deps = { ...t.deps, ...session() }
      await using run = testCreateRun(deps)
      const cost = await run.orThrow(
        quoteCashuMelt({ mint: testMintUrl, invoice: invoice50 })
      )

      const paid = await run(
        meltCashu({
          mint: testMintUrl,
          invoice: invoice50,
          quoteId: cost.quoteId,
          maxTotal: cost.maxTotal,
          purpose: "withdrawal",
        })
      )

      expect(paid.ok && paid.value).toMatchObject({ paidAmount: 50 })
      expect(await testCashuBalance(t.deps.evolu)).toBe(950)
    })
  })

  describe("an attempt records exactly the slots its call asks the mint to sign, and which call it is (cashu/0039)", () => {
    test("a fence at the counter of a melt request that asked for no change gets a row of its own, so a refused fence leaves the request on record", async () => {
      const clock: { nowMs: number } = { nowMs: Date.now() }
      await using t = await createCashuTest({
        now: () => clock.nowMs,
        mint: { meltQuotesExpire: false },
      })
      await fundTestCashuWallet(t, 1000)
      t.mint.setMeltFeeReservePercent(0)
      // The request is held in the mint's queue; the answer never comes.
      t.mint.failNext("melt", { type: "deferred" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      await using run = testCreateRun(t.deps)
      const [request] = (await run.ok(loadCashuAttempts(operationId))).filter(
        (attempt) => attempt.role === "meltChange"
      )
      expect(request).toMatchObject({ slots: 0 })

      // Past the grace the melt is fenced at the counter the request left
      // where it was, and the mint refuses the fence.
      clock.nowMs += CLAIMED_ELSEWHERE_GRACE_MS + 60_000
      t.mint.failNext("swap", {
        type: "error",
        code: 11001,
        detail: "Token already spent.",
      })
      expect((await run(resumeCashuMelt(operationId))).ok).toBe(false)

      const attempts = await run.ok(loadCashuAttempts(operationId))
      const fence = attempts.find(
        (attempt) => attempt.role === "meltSwap" && attempt.ownFence
      )
      expect(fence).toMatchObject({
        counter: request?.counter,
        rejected: true,
      })
      expect(
        attempts.filter((attempt) => attempt.role === "meltChange")
      ).toEqual([
        expect.objectContaining({
          id: request?.id,
          slots: 0,
          rejected: false,
        }),
      ])
    })

    test("a melt request that asks for no change stays on record whatever another call signs at its counter, so a lost one is never closed as never sent", async () => {
      await using t = await setup()
      t.mint.setMeltFeeReservePercent(0)
      // The request is held in the mint's queue; the answer never comes.
      t.mint.failNext("melt", { type: "deferred" })
      const { result } = await melt(t)
      if (result.ok || result.error.type !== "CashuMeltPending")
        throw new Error("not pending")
      const { operationId } = result.error
      await using run = testCreateRun(t.deps)
      const attempts = await run.ok(loadCashuAttempts(operationId))
      const change = attempts.find((attempt) => attempt.role === "meltChange")
      if (change === undefined) throw new Error("no melt request on record")
      expect(change.slots).toBe(0)
      expect(
        attempts.find((attempt) => attempt.role === "meltSwap")?.slots
      ).toBeGreaterThan(0)

      // Another device's topup claim signs at the counter the request asks
      // nothing at, its answer lost; this device takes it over and
      // reclaims it.
      const quote = await run.orThrow(
        createCashuTopupQuote({
          mint: testMintUrl,
          amount: CashuAmount(100),
          purpose: "move",
        })
      )
      t.mint.payMintQuote(quote.quoteId)
      const other = await (await t.otherDevice()).cashuWallet.load(testMintUrl)
      await other.mintProofsBolt11(100, quote.quoteId, undefined, {
        type: "deterministic",
        counter: change.counter,
      })
      const theirs: CashuOperationAttemptId[] = []
      await runMutationWithCompletion((options) => {
        theirs.push(
          upsertTestCashuAttemptElsewhere(
            t.deps.evolu,
            {
              operationId: quote.operationId,
              keysetId: change.keysetId,
              counter: change.counter,
              role: "mint",
            },
            options
          )
        )
      })
      const [takeOver] = theirs
      expect(
        await run.orThrow(claimCashuTopup(quote.operationId, { takeOver }))
      ).toEqual({ type: "claimed", amount: 100 })

      // UNPAID while the request waits in the queue is no final answer.
      expect((await run.orThrow(resumeCashuMelt(operationId))).type).toBe(
        "pending"
      )
      const [held] = t.mint.deferredRequests()
      expect(t.mint.deliverDeferred(held?.id ?? -1)).toEqual({ ok: true })
      const resumed = await run.orThrow(resumeCashuMelt(operationId))

      expect(resumed.type === "paid" && resumed.receipt).toMatchObject({
        paidAmount: 50,
        totalSpent: 50,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(1050)
    })
  })
})
