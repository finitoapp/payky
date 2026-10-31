import {
  type MutationOptions,
  ok,
  sqliteTrue,
  testCreateRun,
} from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"
import { getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"
import { loadCashuWallet } from "../../cashu/cashu-wallet.ts"
import { createQuery } from "../../evolu/schema.ts"
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
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "../shared/key-derivation.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import {
  CASHU_OUTPUT_BLOCK,
  withCashuCounter,
} from "./cashu-counter-actions.ts"
import {
  loadCashuAttempts,
  loadCashuReceive,
  loadCashuTopup,
} from "./cashu-guards.ts"
import { quoteCashuMelt } from "./cashu-melt-actions.ts"
import {
  holdCashuProofs,
  updateCashuOperation,
  upsertCashuOperationRow,
} from "./cashu-proof-actions.ts"
import {
  cashuOperationAttemptsQuery,
  cashuOperationCountQuery,
  pendingCashuTopupsQuery,
} from "./cashu-queries.ts"
import {
  inspectCashuToken,
  receiveCashuToken,
} from "./cashu-receive-actions.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "./cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuAttemptRole,
  CashuBolt11Schema,
  type CashuOperationAttemptId,
  type CashuOperationId,
  type CashuProofId,
  CashuQuoteId,
  CashuTokenText,
  KeysetId,
} from "./cashu-types.ts"
import {
  cashuMeltOperationIdFor,
  cashuTopupOperationIdFor,
} from "./cashu-utils.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

const paykyNostrHex = bytesToHex(deriveNostrSecretKey(testCashuMasterKey))

const inspect = async (text: CashuTokenText) => {
  const inspected = await inspectCashuToken(text, paykyNostrHex)
  if (!inspected.ok) throw new Error(inspected.error.type)
  return inspected.value
}

const receive = async (t: CashuTest, text: CashuTokenText) => {
  await using run = testCreateRun(t.deps)
  return await run(receiveCashuToken(await inspect(text)))
}

const operationCount = async (t: CashuTest) =>
  (await t.deps.evolu.loadQuery(cashuOperationCountQuery))[0]?.count

/** Another device's receive of the same token, as it syncs in. */
const writeReceiveElsewhere = async (
  t: CashuTest,
  text: CashuTokenText,
  status: "pending" | "done"
) => {
  const { receiveOperationId } = await inspect(text)
  const attemptIds: Array<CashuOperationAttemptId> = []
  await runMutationWithCompletion((options) => {
    upsertCashuOperationRow(
      t.deps.evolu,
      {
        id: receiveOperationId,
        kind: "receive",
        status,
        mintUrl: testMintUrl,
        amount: CashuAmount(8),
        keysetId: null,
      },
      options
    )
    attemptIds.push(
      upsertTestCashuAttemptElsewhere(
        t.deps.evolu,
        {
          operationId: receiveOperationId,
          keysetId: t.mint.keysetId,
          counter: 7000,
          role: "swap",
        },
        options
      )
    )
    t.deps.evolu.upsert(
      "cashuReceive",
      { id: receiveOperationId, tokenText: text, fee: NonNegativeInteger(0) },
      options
    )
  })
  const [attemptId] = attemptIds
  if (attemptId === undefined) throw new Error("no attempt written")
  return { operationId: receiveOperationId, attemptId }
}

const receiveTakingOver = async (
  t: CashuTest,
  text: CashuTokenText,
  takeOver: CashuOperationAttemptId
) => {
  await using run = testCreateRun(t.deps)
  return await run(receiveCashuToken(await inspect(text), { takeOver }))
}

/** That device swaps the token at its attempt, and stores nothing here. */
const anotherDeviceSwapsAt7000 = async (t: CashuTest, text: CashuTokenText) => {
  const other = await t.otherDevice()
  const wallet = await other.cashuWallet.load(testMintUrl)
  await wallet.receive(text, undefined, {
    type: "deterministic",
    counter: 7000,
  })
}

/** Every Cashu booking, for assertions. */
const cashuTransactionsQuery = createQuery((db) =>
  db
    .selectFrom("accountTransactionCashu")
    .select("accountTransactionCashu.id")
    .where("accountTransactionCashu.isDeleted", "is not", sqliteTrue)
)

describe("receiveCashuToken", () => {
  test("swaps the token into available proofs under a done receive", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(21)

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toEqual({
      type: "received",
      amount: 21,
      fee: 0,
    })
    expect(await testCashuBalance(t.deps.evolu)).toBe(21)
    await using run = testCreateRun(t.deps)
    const receiveRow = await run.ok(
      loadCashuReceive((await inspect(token.text)).receiveOperationId)
    )
    expect(receiveRow).toMatchObject({
      status: "done",
      tokenText: token.text,
      fee: 0,
    })
  })

  test("credits what is left after the mint's input fee", async () => {
    await using t = await createCashuTest({ mint: { inputFeePpk: 1000 } })
    // 21 sats are three proofs (16, 4, 1): a fee of 3.
    const token = await createTestCashuCustomer(t).token(21)

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toEqual({
      type: "received",
      amount: 18,
      fee: 3,
    })
  })

  test("refuses a token the fee would eat whole, writing nothing", async () => {
    await using t = await createCashuTest({ mint: { inputFeePpk: 1000 } })
    const token = await createTestCashuCustomer(t).token(1)

    const result = await receive(t, token.text)

    expect(!result.ok && result.error.type).toBe("AmountConsumedByFee")
    expect(await operationCount(t)).toBe(0)
  })

  test("a token another wallet already spent is received elsewhere, writing no operation", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(8)
    // Linky on the same npub swapped it first (cashu/0029).
    await token.wallet.receive(token.text)

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toEqual({ type: "receivedElsewhere" })
    expect(await operationCount(t)).toBe(0)
  })

  test("a token from a mint that does not list NUT-07 is refused before anything is written (cashu/0033)", async () => {
    await using t = await createCashuTest({ mint: { supportsNut07: false } })
    const token = await createTestCashuCustomer(t).token(8)
    const swapsBefore = t.mint.requestCount("swap")

    const result = await receive(t, token.text)

    expect(!result.ok && result.error.type).toBe("CashuMintUnsupported")
    expect(await operationCount(t)).toBe(0)
    expect(t.mint.requestCount("swap")).toBe(swapsBefore)
  })

  test("an unreachable mint writes nothing", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(8)
    t.mint.failNext("info", { type: "unreachable" })

    const result = await receive(t, token.text)

    expect(!result.ok && result.error.type).toBe("MintUnreachable")
    expect(await operationCount(t)).toBe(0)
  })

  test("a failure before the swap leaves no pending receive, and a retry receives it", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(8)
    // The first use of the keyset restores it, under the counter lock.
    t.mint.failNext("restore", { type: "unreachable" })

    const failed = await receive(t, token.text)

    expect(!failed.ok && failed.error.type).toBe("MintUnreachable")
    expect(await operationCount(t)).toBe(0)
    const retried = await receive(t, token.text)
    expect(retried.ok && retried.value).toMatchObject({
      type: "received",
      amount: 8,
    })
  })

  test("a pending receive no device reserved a counter for is taken over", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(8)
    // A crash between the pending row and the reservation, as written before
    // the two shared one batch.
    const { receiveOperationId } = await inspect(token.text)
    await runMutationWithCompletion((options) => {
      upsertCashuOperationRow(
        t.deps.evolu,
        {
          id: receiveOperationId,
          kind: "receive",
          status: "pending",
          mintUrl: testMintUrl,
          amount: CashuAmount(8),
          keysetId: null,
        },
        options
      )
      t.deps.evolu.upsert(
        "cashuReceive",
        {
          id: receiveOperationId,
          tokenText: token.text,
          fee: NonNegativeInteger(0),
        },
        options
      )
    })

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toMatchObject({
      type: "received",
      amount: 8,
    })
    expect(await testCashuBalance(t.deps.evolu)).toBe(8)
  })

  test("a token locked to another key is refused before any mint is asked", async () => {
    await using t = await createCashuTest()
    const someoneElse = `02${getPublicKey(new Uint8Array(32).fill(5))}`
    const token = await createTestCashuCustomer(t).token(8, someoneElse)

    const inspected = await inspectCashuToken(token.text, paykyNostrHex)

    expect(!inspected.ok && inspected.error.type).toBe("TokenLocked")
  })

  test("a token locked to the nostr key is signed with it", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(
      8,
      `02${getPublicKey(deriveNostrSecretKey(testCashuMasterKey))}`
    )

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toMatchObject({
      type: "received",
      amount: 8,
    })
  })

  describe("another device got there first", () => {
    test("another device received it: done, nothing written", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      await writeReceiveElsewhere(t, token.text, "done")
      const signedBefore = t.mint.signedCount()

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({ type: "done" })
      expect(t.mint.signedCount()).toBe(signedBefore)
      expect(await loadTestCashuProofs(t.deps.evolu)).toEqual([])
    })

    test("a receive another device has pending: nothing is written, never failed", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      const { operationId, attemptId } = await writeReceiveElsewhere(
        t,
        token.text,
        "pending"
      )

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({
        type: "receivingElsewhere",
        attemptId,
      })
      await using run = testCreateRun(t.deps)
      expect((await run.ok(loadCashuReceive(operationId)))?.status).toBe(
        "pending"
      )
    })
  })

  describe("every attempt is on record", () => {
    test("this device's lost swap is reclaimed though another device's attempt came after it", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      t.mint.failNext("swap", { type: "lostResponse" })
      const lost = await receive(t, token.text)
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      // Another device reserved its own slots meanwhile, and synced them in
      // after this device's.
      const { receiveOperationId } = await inspect(token.text)
      await runMutationWithCompletion((options) =>
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          {
            operationId: receiveOperationId,
            keysetId: t.mint.keysetId,
            counter: 7000,
            role: "swap",
          },
          options
        )
      )

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(8)
    })
  })

  describe("another device's attempt is taken over past the grace", () => {
    test("within the grace a spent token is left to that device", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      const { attemptId } = await writeReceiveElsewhere(
        t,
        token.text,
        "pending"
      )
      await anotherDeviceSwapsAt7000(t, token.text)
      const restoresBefore = t.mint.requestCount("restore")

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({
        type: "receivingElsewhere",
        attemptId,
      })
      expect(t.mint.requestCount("restore")).toBe(restoresBefore)
      expect(await loadTestCashuProofs(t.deps.evolu)).toEqual([])
    })

    test("a swap that device made and never finished is reclaimed from its attempt", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      const { operationId, attemptId } = await writeReceiveElsewhere(
        t,
        token.text,
        "pending"
      )
      await anotherDeviceSwapsAt7000(t, token.text)

      const result = await receiveTakingOver(t, token.text, attemptId)

      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(8)
      await using run = testCreateRun(t.deps)
      expect((await run.ok(loadCashuReceive(operationId)))?.status).toBe("done")
    })

    test("a token that device never swapped is swapped in its place", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      const { attemptId } = await writeReceiveElsewhere(
        t,
        token.text,
        "pending"
      )

      const result = await receiveTakingOver(t, token.text, attemptId)

      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(8)
    })

    test("an attempt that is no longer that device's latest is waited for again", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      const { operationId, attemptId } = await writeReceiveElsewhere(
        t,
        token.text,
        "pending"
      )
      // That device came back and reserved again.
      const newer = await (async () => {
        const ids: Array<CashuOperationAttemptId> = []
        await runMutationWithCompletion((options) => {
          ids.push(
            upsertTestCashuAttemptElsewhere(
              t.deps.evolu,
              {
                operationId,
                keysetId: t.mint.keysetId,
                counter: 7064,
                role: "swap",
              },
              options
            )
          )
        })
        return ids[0]
      })()

      const result = await receiveTakingOver(t, token.text, attemptId)

      expect(result.ok && result.value).toEqual({
        type: "receivingElsewhere",
        attemptId: newer,
      })
      expect(await loadTestCashuProofs(t.deps.evolu)).toEqual([])
    })
  })

  describe("a settled receive stays settled", () => {
    /** Received here, then another device's late write syncs in. */
    const receiveThenLateWrite = async (
      t: CashuTest,
      lateWrite: (
        operationId: CashuOperationId,
        options: MutationOptions
      ) => void
    ) => {
      const token = await createTestCashuCustomer(t).token(8)
      const received = await receive(t, token.text)
      expect(received.ok && received.value.type).toBe("received")
      const { receiveOperationId } = await inspect(token.text)
      await using run = testCreateRun(t.deps)
      const settledAt = (await run.ok(loadCashuReceive(receiveOperationId)))
        ?.settledAt
      expect(settledAt).not.toBeNull()
      await runMutationWithCompletion((options) =>
        lateWrite(receiveOperationId, options)
      )
      return { token, receiveOperationId, settledAt }
    }

    test("another device's pending, written after the receive completed, leaves it done", async () => {
      await using t = await createCashuTest()
      const { token, receiveOperationId, settledAt } =
        await receiveThenLateWrite(t, (id, options) => {
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
            {
              operationId: id,
              keysetId: t.mint.keysetId,
              counter: 7000,
              role: "swap",
            },
            options
          )
        })
      const signedBefore = t.mint.signedCount()

      await using run = testCreateRun(t.deps)
      expect(await run.ok(loadCashuReceive(receiveOperationId))).toMatchObject({
        status: "done",
        settledAt,
      })
      const again = await receive(t, token.text)
      expect(again.ok && again.value).toEqual({ type: "done" })
      expect(t.mint.signedCount()).toBe(signedBefore)
      expect(await testCashuBalance(t.deps.evolu)).toBe(8)
    })

    test("another device's failed, written after the receive completed, leaves it done", async () => {
      await using t = await createCashuTest()
      const { receiveOperationId, settledAt } = await receiveThenLateWrite(
        t,
        (id, options) =>
          updateCashuOperation(t.deps.evolu, id, { status: "failed" }, options)
      )

      await using run = testCreateRun(t.deps)
      expect(await run.ok(loadCashuReceive(receiveOperationId))).toMatchObject({
        status: "done",
        settledAt,
      })
    })
  })

  describe("a slot holds the outputs of one operation (cashu/0029)", () => {
    /** Another device signs at `counter` before its attempt syncs in. */
    const anotherDeviceMints = async (
      t: CashuTest,
      amount: number,
      counter: number
    ) => {
      const other = await t.otherDevice()
      const wallet = await other.cashuWallet.load(testMintUrl)
      const quote = await wallet.createMintQuoteBolt11(amount)
      t.mint.payMintQuote(quote.quote)
      await wallet.mintProofsBolt11(amount, quote.quote, undefined, {
        type: "deterministic",
        counter,
      })
    }

    /** Another operation of the account with a block at `counter`. */
    const writeOtherOperation = async (t: CashuTest, counter: number) => {
      const operationId = cashuTopupOperationIdFor(
        testMintUrl,
        CashuQuoteId("other-quote")
      )
      await runMutationWithCompletion((options) => {
        upsertCashuOperationRow(
          t.deps.evolu,
          {
            id: operationId,
            kind: "topup",
            status: "pending",
            mintUrl: testMintUrl,
            amount: CashuAmount(8),
            keysetId: null,
          },
          options
        )
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          { operationId, keysetId: t.mint.keysetId, counter, role: "swap" },
          options
        )
      })
      return operationId
    }

    test("a block the mint refused is never reclaimed, though another operation's outputs sit there", async () => {
      await using t = await createCashuTest()
      const customer = createTestCashuCustomer(t)
      const token = await customer.token(8)
      const first = await receive(t, token.text)
      expect(first.ok).toBe(true)
      const next = await customer.token(8)
      // Another device signed this device's next slots, not yet synced in.
      const [attempt] = (
        await t.deps.evolu.loadQuery(
          cashuOperationAttemptsQuery(
            (
              await inspect(token.text)
            ).receiveOperationId
          )
        )
      ).map((row) => row.counter + row.slots)
      if (attempt === undefined) throw new Error("no attempt")
      await anotherDeviceMints(t, 100, attempt)
      // The swap collides there, and its retry never reaches the mint.
      t.mint.failNext("swap", { type: "ok" })
      t.mint.failNext("swap", { type: "unreachable" })
      const failed = await receive(t, next.text)
      expect(!failed.ok && failed.error.type).toBe("MintUnreachable")
      // Linky on the same npub swaps the token meanwhile.
      await next.wallet.receive(next.text)

      const result = await receive(t, next.text)

      expect(result.ok && result.value).toEqual({ type: "receivedElsewhere" })
      expect(await testCashuBalance(t.deps.evolu)).toBe(8)
      const attempts = await t.deps.evolu.loadQuery(
        cashuOperationAttemptsQuery(
          (await inspect(next.text)).receiveOperationId
        )
      )
      // The collision refused the first; the retry signed nothing, and the
      // token is spent, so the second holds nothing for good (cashu/0029).
      expect(attempts.map((row) => row.isRejected)).toEqual([1, 1])
    })

    test("a lost swap whose block an open operation shares waits, and is reclaimed once it closes", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      t.mint.failNext("swap", { type: "lostResponse" })
      const lost = await receive(t, token.text)
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      // Another device reserved the same slots for another operation before
      // either saw the other's.
      const [own] = await t.deps.evolu.loadQuery(
        cashuOperationAttemptsQuery(
          (await inspect(token.text)).receiveOperationId
        )
      )
      if (own === undefined) throw new Error("no attempt")
      const other = await writeOtherOperation(t, own.counter)

      const waiting = await receive(t, token.text)

      expect(!waiting.ok && waiting.error.type).toBe("CashuReclaimAmbiguous")
      expect(await testCashuBalance(t.deps.evolu)).toBe(0)
      await runMutationWithCompletion((options) =>
        updateCashuOperation(
          t.deps.evolu,
          other,
          { status: "failed", error: null },
          options
        )
      )
      const result = await receive(t, token.text)
      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(8)
    })
  })
  describe("a status is no fact (cashu/0029)", () => {
    /** This device's swap of the token, refused by the mint. */
    const refusedHere = async (t: CashuTest, text: CashuTokenText) => {
      t.mint.failNext("swap", {
        type: "error",
        code: 11002,
        detail: "inputs and outputs are not balanced",
      })
      const refused = await receive(t, text)
      expect(!refused.ok && refused.error.type).toBe("MintRejected")
    }

    /**
     * Another device, not having seen this one's attempt, swaps the token at
     * the same block and loses the answer; its attempt syncs in here.
     */
    const anotherDeviceSwapsAndLosesIt = async (
      t: CashuTest,
      text: CashuTokenText
    ) => {
      const other = await t.otherDevice()
      t.mint.failNext("swap", { type: "lostResponse" })
      await using otherRun = testCreateRun(other)
      const lost = await otherRun(receiveCashuToken(await inspect(text)))
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      await syncTestCashuAttempts(other.evolu, t.deps.evolu)
      await using run = testCreateRun(t.deps)
      const theirs = (
        await run.ok(
          loadCashuAttempts((await inspect(text)).receiveOperationId)
        )
      ).find((attempt) => !attempt.own)
      if (theirs === undefined) throw new Error("no attempt synced in")
      return theirs.id
    }

    /** A `failed` on the receive, as an app before cashu/0029 wrote it. */
    const writeFailed = async (t: CashuTest, text: CashuTokenText) => {
      const { receiveOperationId } = await inspect(text)
      await runMutationWithCompletion((options) =>
        updateCashuOperation(
          t.deps.evolu,
          receiveOperationId,
          { status: "failed" },
          options
        )
      )
    }

    test("another device's signed swap is reclaimed though a refusal on this device came after it", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      await refusedHere(t, token.text)
      const attemptId = await anotherDeviceSwapsAndLosesIt(t, token.text)
      // The refusal's `failed`, later than that device's `pending`.
      await writeFailed(t, token.text)

      const waiting = await receive(t, token.text)
      expect(waiting.ok && waiting.value).toEqual({
        type: "receivingElsewhere",
        attemptId,
      })
      const result = await receiveTakingOver(t, token.text, attemptId)
      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
      expect(await testCashuBalance(t.deps.evolu)).toBe(8)
    })

    test("a mint refusal marks this device's attempt and writes no failed", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)

      await refusedHere(t, token.text)

      const { receiveOperationId } = await inspect(token.text)
      const attempts = await t.deps.evolu.loadQuery(
        cashuOperationAttemptsQuery(receiveOperationId)
      )
      expect(attempts.map((row) => row.isRejected)).toEqual([1])
      expect(
        (await loadTestCashuOperations(t.deps.evolu)).map((row) => row.status)
      ).toEqual(["pending"])
    })

    test("a failed written before reads as pending", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      const { operationId, attemptId } = await writeReceiveElsewhere(
        t,
        token.text,
        "pending"
      )
      await writeFailed(t, token.text)

      await using run = testCreateRun(t.deps)
      expect((await run.ok(loadCashuReceive(operationId)))?.status).toBe(
        "pending"
      )
      const result = await receive(t, token.text)
      expect(result.ok && result.value).toEqual({
        type: "receivingElsewhere",
        attemptId,
      })
    })

    test("another device's refused attempt is not waited for", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      const { attemptId } = await writeReceiveElsewhere(
        t,
        token.text,
        "pending"
      )
      await runMutationWithCompletion((options) =>
        t.deps.evolu.update(
          "cashuOperationAttempt",
          { id: attemptId, isRejected: 1 },
          options
        )
      )

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
    })
  })

  describe("a block's claim ends on the mint's word (cashu/0029)", () => {
    const attemptsOf = async (t: CashuTest, operationId: CashuOperationId) =>
      t.deps.evolu.loadQuery(cashuOperationAttemptsQuery(operationId))

    /** This device's swap, signed at its block and the answer lost. */
    const lostSwap = async (t: CashuTest, amount = 8) => {
      const token = await createTestCashuCustomer(t).token(amount)
      t.mint.failNext("swap", { type: "lostResponse" })
      const lost = await receive(t, token.text)
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      const { receiveOperationId } = await inspect(token.text)
      const [own] = await attemptsOf(t, receiveOperationId)
      if (own === undefined) throw new Error("no attempt")
      return { token, operationId: receiveOperationId, counter: own.counter }
    }

    const topupQuote = async (t: CashuTest) => {
      await using run = testCreateRun(t.deps)
      return await run.orThrow(
        createCashuTopupQuote({
          mint: testMintUrl,
          amount: CashuAmount(100),
          purpose: "payment",
        })
      )
    }

    /**
     * Another device's attempt for `operationId` at `counter`, synced in: a
     * topup's mint unless `role` says otherwise.
     */
    const attemptElsewhere = async (
      t: CashuTest,
      operationId: CashuOperationId,
      counter: number,
      role: CashuAttemptRole = "mint"
    ) => {
      const ids: Array<CashuOperationAttemptId> = []
      await runMutationWithCompletion((options) => {
        ids.push(
          upsertTestCashuAttemptElsewhere(
            t.deps.evolu,
            { operationId, keysetId: t.mint.keysetId, counter, role },
            options
          )
        )
      })
      const [id] = ids
      if (id === undefined) throw new Error("no attempt written")
      return id
    }

    test("a spent token's empty blocks are refused, and the operation sharing them is reclaimed", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      // The swap never reaches the mint, and Linky spends the token.
      t.mint.failNext("swap", { type: "unreachable" })
      const failed = await receive(t, token.text)
      expect(!failed.ok && failed.error.type).toBe("MintUnreachable")
      await token.wallet.receive(token.text)
      const { receiveOperationId } = await inspect(token.text)

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({ type: "receivedElsewhere" })
      const [own] = await attemptsOf(t, receiveOperationId)
      expect(own?.isRejected).toBe(1)
      if (own === undefined) throw new Error("no attempt")

      // Another device claimed a topup at the same block and lost the
      // answer: the receive no longer holds the block.
      const quote = await topupQuote(t)
      t.mint.payMintQuote(quote.quoteId)
      const other = await t.otherDevice()
      const wallet = await other.cashuWallet.load(testMintUrl)
      await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
        type: "deterministic",
        counter: own.counter,
      })
      const theirs = await attemptElsewhere(t, quote.operationId, own.counter)
      await using run = testCreateRun(t.deps)
      const claimed = await run(
        claimCashuTopup(quote.operationId, { takeOver: theirs })
      )
      expect(claimed.ok && claimed.value).toEqual({
        type: "claimed",
        amount: 100,
      })
    })

    test("a receive whose outputs another operation's contest gave to no one reads contested (cashu/0029)", async () => {
      await using t = await createCashuTest()
      const { token, operationId, counter } = await lostSwap(t)
      // A topup another device issued elsewhere, its attempt on record at
      // the receive's block: both could have signed the receive's outputs.
      const quote = await topupQuote(t)
      t.mint.payMintQuote(quote.quoteId)
      const other = await t.otherDevice()
      const wallet = await other.cashuWallet.load(testMintUrl)
      await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
        type: "deterministic",
        counter: counter + 4 * CASHU_OUTPUT_BLOCK,
      })
      const theirs = await attemptElsewhere(t, quote.operationId, counter)
      // The topup's reclaim settles the contest past the grace.
      await using run = testCreateRun(t.deps)
      expect(
        (
          await run(
            claimCashuTopup(quote.operationId, {
              takeOver: theirs,
              settleContest: true,
            })
          )
        ).ok
      ).toBe(true)
      expect(
        (await attemptsOf(t, operationId)).map((row) => row.isContested)
      ).toEqual([1])

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({ type: "contested" })
    })

    test("a topup whose outputs a contest gave to no one is closed contested, unbooked, and polled no more (cashu/0029)", async () => {
      await using t = await createCashuTest()
      // This device's claim is signed and its answer lost.
      const quote = await topupQuote(t)
      t.mint.payMintQuote(quote.quoteId)
      t.mint.failNext("mint", { type: "lostResponse" })
      await using run = testCreateRun(t.deps)
      const lost = await run(claimCashuTopup(quote.operationId))
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      const [own] = await attemptsOf(t, quote.operationId)
      if (own === undefined) throw new Error("no attempt")
      // Another device swapped a token at the same slots, not knowing them
      // taken: the mint refused it, and that answer was lost there, so its
      // attempt stands. Another wallet spent the token since. Both calls
      // could have signed the outputs at those slots (cashu/0029).
      const token = await createTestCashuCustomer(t).token(8)
      await token.wallet.receive(token.text)
      const receiveId = (await inspect(token.text)).receiveOperationId
      await runMutationWithCompletion((options) => {
        upsertCashuOperationRow(
          t.deps.evolu,
          {
            id: receiveId,
            kind: "receive",
            status: "pending",
            mintUrl: testMintUrl,
            amount: CashuAmount(8),
            keysetId: null,
          },
          options
        )
        t.deps.evolu.upsert(
          "cashuReceive",
          { id: receiveId, tokenText: token.text, fee: NonNegativeInteger(0) },
          options
        )
      })
      await attemptElsewhere(t, receiveId, own.counter, "swap")
      const contest = await run(claimCashuTopup(quote.operationId))
      expect(!contest.ok && contest.error.type).toBe("CashuReclaimAmbiguous")

      const settled = await run(
        claimCashuTopup(quote.operationId, { settleContest: true })
      )

      expect(settled.ok && settled.value).toEqual({ type: "contested" })
      const topup = await run.ok(loadCashuTopup(quote.operationId))
      expect(topup?.status).toBe("done")
      expect(topup?.settledAt).not.toBeNull()
      expect(await t.deps.evolu.loadQuery(cashuTransactionsQuery)).toEqual([])
      expect(
        (await t.deps.evolu.loadQuery(pendingCashuTopupsQuery)).map(
          (row) => row.id
        )
      ).not.toContain(quote.operationId)
      const again = await run(claimCashuTopup(quote.operationId))
      expect(again.ok && again.value).toEqual({ type: "done" })
    })

    describe("an operation whose block's first slot is unsigned contests nothing in it (cashu/0029)", () => {
      test("a spent token's receive leaves the outputs another operation signed in its block to that operation", async () => {
        await using t = await createCashuTest()
        const token = await createTestCashuCustomer(t).token(8)
        // The swap never reaches the mint, and another wallet spends the
        // token: the receive stays open, its block reserved and unsigned.
        t.mint.failNext("swap", { type: "unreachable" })
        const failed = await receive(t, token.text)
        expect(!failed.ok && failed.error.type).toBe("MintUnreachable")
        await token.wallet.receive(token.text)
        const { receiveOperationId } = await inspect(token.text)
        const [own] = await attemptsOf(t, receiveOperationId)
        if (own === undefined) throw new Error("no attempt")

        // Another device's topup, its block one slot in, signed and the
        // answer lost: its outputs sit in the receive's block, past its
        // first slot.
        const quote = await topupQuote(t)
        t.mint.payMintQuote(quote.quoteId)
        const other = await t.otherDevice()
        const wallet = await other.cashuWallet.load(testMintUrl)
        await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
          type: "deterministic",
          counter: own.counter + 1,
        })
        const theirs = await attemptElsewhere(
          t,
          quote.operationId,
          own.counter + 1
        )
        await using run = testCreateRun(t.deps)
        const claimed = await run(
          claimCashuTopup(quote.operationId, { takeOver: theirs })
        )

        expect(claimed.ok && claimed.value).toEqual({
          type: "claimed",
          amount: 100,
        })
        const after = await receive(t, token.text)
        expect(after.ok && after.value).toEqual({ type: "receivedElsewhere" })
      })
    })

    test("a topup whose quote is unpaid gives the block to the receive", async () => {
      await using t = await createCashuTest()
      const { token, counter } = await lostSwap(t)
      // Another device reserved the same block for a topup nobody paid.
      const quote = await topupQuote(t)
      await attemptElsewhere(t, quote.operationId, counter)

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
      expect(
        (await attemptsOf(t, quote.operationId)).map((row) => row.isRejected)
      ).toEqual([1])
    })
    test("a topup whose quote is paid, its mint call perhaps in flight, contests the block", async () => {
      await using t = await createCashuTest()
      const { token, counter } = await lostSwap(t)
      // A mint signs a quote's outputs before the quote reads ISSUED.
      const quote = await topupQuote(t)
      t.mint.payMintQuote(quote.quoteId)
      await attemptElsewhere(t, quote.operationId, counter)

      const result = await receive(t, token.text)

      expect(!result.ok && result.error.type).toBe("CashuReclaimAmbiguous")
      expect(
        (await attemptsOf(t, quote.operationId)).map((row) => row.isRejected)
      ).toEqual([null])
    })

    /**
     * A warm-up receive, a run of slots this device's counter skipped
     * unsigned, as past a collision, then this device's swap of `token`,
     * signed at its slots and the answer lost: another call can start half a
     * block before it, in the unsigned run.
     */
    const lostSwapPastTheStart = async (t: CashuTest) => {
      const customer = createTestCashuCustomer(t)
      const warm = await customer.token(4)
      expect((await receive(t, warm.text)).ok).toBe(true)
      await using run = testCreateRun(t.deps)
      const loaded = await run.orThrow(loadCashuWallet(testMintUrl))
      await run.orThrow(
        withCashuCounter(
          loaded,
          loaded.keysetId,
          (held) => async () =>
            ok(await held.advanceTo(held.current() + CASHU_OUTPUT_BLOCK))
        )
      )
      const token = await customer.token(8)
      t.mint.failNext("swap", { type: "lostResponse" })
      const lost = await receive(t, token.text)
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      const { receiveOperationId } = await inspect(token.text)
      const [own] = await attemptsOf(t, receiveOperationId)
      if (own === undefined) throw new Error("no attempt")
      return { customer, token, counter: own.counter }
    }

    test("an operation whose call never signed keeps its block while no call has signed its first slot", async () => {
      await using t = await createCashuTest()
      const { token, counter } = await lostSwapPastTheStart(t)
      // A topup nobody paid yet, its block half a block before this one.
      const quote = await topupQuote(t)
      const theirs = await attemptElsewhere(
        t,
        quote.operationId,
        counter - CASHU_OUTPUT_BLOCK / 2
      )

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toMatchObject({ type: "received" })
      expect(
        (await attemptsOf(t, quote.operationId)).map((row) => row.isRejected)
      ).toEqual([null])
      // Then it is paid, and the other device mints at its block and loses
      // the answer: its outputs are reclaimed from that block.
      t.mint.payMintQuote(quote.quoteId)
      const other = await t.otherDevice()
      const wallet = await other.cashuWallet.load(testMintUrl)
      await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
        type: "deterministic",
        counter: counter - CASHU_OUTPUT_BLOCK / 2,
      })
      await using run = testCreateRun(t.deps)
      const claimed = await run(
        claimCashuTopup(quote.operationId, { takeOver: theirs })
      )
      expect(claimed.ok && claimed.value).toEqual({
        type: "claimed",
        amount: 100,
      })
    })

    test("a call that signs its first slot right after it was read keeps its block", async () => {
      await using t = await createCashuTest()
      const { token, counter } = await lostSwapPastTheStart(t)
      const quote = await topupQuote(t)
      const theirCounter = counter - CASHU_OUTPUT_BLOCK / 2
      const theirs = await attemptElsewhere(t, quote.operationId, theirCounter)
      // The receive's block, then the slots the topup's shares, then the
      // topup's first slot, read unsigned; then the quote is paid, and the
      // other device mints at its block, signing that first slot.
      const other = await t.otherDevice()
      const wallet = await other.cashuWallet.load(testMintUrl)
      t.mint.failNext("restore", { type: "ok" })
      t.mint.failNext("restore", { type: "ok" })
      t.mint.failNext("restore", {
        type: "then",
        run: async () => {
          t.mint.payMintQuote(quote.quoteId)
          await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
            type: "deterministic",
            counter: theirCounter,
          })
        },
      })

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toMatchObject({ type: "received" })
      expect(
        (await attemptsOf(t, quote.operationId)).map((row) => row.isRejected)
      ).toEqual([null])
      // The other device lost the answer: its outputs are reclaimed.
      await using run = testCreateRun(t.deps)
      const claimed = await run(
        claimCashuTopup(quote.operationId, { takeOver: theirs })
      )
      expect(claimed.ok && claimed.value).toEqual({
        type: "claimed",
        amount: 100,
      })
    })

    test("an answer that a call never signed is asked again for each row naming its block", async () => {
      await using t = await createCashuTest()
      const { token, counter } = await lostSwapPastTheStart(t)
      // Two devices reserved the topup's block, each with a row of its own.
      const quote = await topupQuote(t)
      const theirCounter = counter - CASHU_OUTPUT_BLOCK / 2
      await attemptElsewhere(t, quote.operationId, theirCounter)
      await attemptElsewhere(t, quote.operationId, theirCounter)
      // The first row's first slot is read unsigned and it yields; then the
      // quote is paid and minted at its block before the second row is
      // judged.
      const other = await t.otherDevice()
      const wallet = await other.cashuWallet.load(testMintUrl)
      t.mint.failNext("restore", { type: "ok" })
      t.mint.failNext("restore", { type: "ok" })
      t.mint.failNext("restore", {
        type: "then",
        run: async () => {
          t.mint.payMintQuote(quote.quoteId)
          await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
            type: "deterministic",
            counter: theirCounter,
          })
        },
      })

      const result = await receive(t, token.text)

      expect(!result.ok && result.error.type).toBe("CashuReclaimAmbiguous")
      expect(
        (await attemptsOf(t, quote.operationId)).map((row) => row.isRejected)
      ).toEqual([null, null])
    })

    test("a contest refuses another operation's block only where nothing of its is left", async () => {
      await using t = await createCashuTest()
      const { customer, token, counter } = await lostSwapPastTheStart(t)
      // Another device's receive, its block half a block before this one,
      // swapped at its first slot with the answer lost: its token is spent,
      // so it could have signed this device's outputs too.
      const theirs = await customer.token(8)
      const theirCounter = counter - CASHU_OUTPUT_BLOCK / 2
      const other = await t.otherDevice()
      const wallet = await other.cashuWallet.load(testMintUrl)
      await wallet.receive(theirs.text, undefined, {
        type: "deterministic",
        counter: theirCounter,
      })
      const theirId = (await inspect(theirs.text)).receiveOperationId
      await runMutationWithCompletion((options) => {
        upsertCashuOperationRow(
          t.deps.evolu,
          {
            id: theirId,
            kind: "receive",
            status: "pending",
            mintUrl: testMintUrl,
            amount: CashuAmount(8),
            keysetId: null,
          },
          options
        )
        t.deps.evolu.upsert(
          "cashuReceive",
          { id: theirId, tokenText: theirs.text, fee: NonNegativeInteger(0) },
          options
        )
      })
      const theirAttempt = await attemptElsewhere(
        t,
        theirId,
        theirCounter,
        "swap"
      )

      const waiting = await receive(t, token.text)
      expect(!waiting.ok && waiting.error.type).toBe("CashuReclaimAmbiguous")
      await using run = testCreateRun(t.deps)
      const settled = await run(
        receiveCashuToken(await inspect(token.text), { settleContest: true })
      )

      expect(settled.ok && settled.value).toEqual({ type: "contested" })
      expect(
        (await attemptsOf(t, theirId)).map((row) => row.isRejected)
      ).toEqual([null])
      const reclaimed = await receiveTakingOver(t, theirs.text, theirAttempt)
      expect(reclaimed.ok && reclaimed.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
      // The warm-up, this device's sats given to no one, and theirs.
      expect(await testCashuBalance(t.deps.evolu)).toBe(20)
    })

    test("a swap whose answer could not be read leaves its block on record, and is reclaimed", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      t.mint.failNext("swap", { type: "garbledResponse" })

      const garbled = await receive(t, token.text)

      expect(!garbled.ok && garbled.error.type).toBe("MintUnreachable")
      const { receiveOperationId } = await inspect(token.text)
      expect(
        (await attemptsOf(t, receiveOperationId)).map((row) => row.isRejected)
      ).toEqual([null])
      const result = await receive(t, token.text)
      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
    })
    /** Another device's pending melt, its rows synced in, holding `held`. */
    const writeMeltElsewhere = async (
      t: CashuTest,
      held: ReadonlyArray<CashuProofId>
    ) => {
      await using run = testCreateRun(t.deps)
      const invoice = "lnbc500n1pjfakeinvoice"
      const cost = await run.orThrow(
        quoteCashuMelt({ mint: testMintUrl, invoice })
      )
      const operationId = cashuMeltOperationIdFor(
        testMintUrl,
        CashuQuoteId(cost.quoteId)
      )
      await runMutationWithCompletion((options) => {
        upsertCashuOperationRow(
          t.deps.evolu,
          {
            id: operationId,
            kind: "melt",
            status: "pending",
            mintUrl: testMintUrl,
            amount: CashuAmount(cost.amount),
            keysetId: KeysetId(t.mint.keysetId),
          },
          options
        )
        t.deps.evolu.upsert(
          "cashuMelt",
          {
            id: operationId,
            quoteId: CashuQuoteId(cost.quoteId),
            lnInvoice: CashuBolt11Schema.decode(invoice),
            feeReserve: NonNegativeInteger(cost.feeReserve),
            inputsTotal: NonNegativeInteger(0),
            purpose: "withdrawal",
            expiresAt: null,
          },
          options
        )
        holdCashuProofs(t.deps.evolu, held, operationId, options)
      })
      return operationId
    }

    test("a melt whose quote is unpaid gives its blank outputs' block to the receive", async () => {
      await using t = await createCashuTest()
      const { token, counter } = await lostSwap(t)
      const melt = await writeMeltElsewhere(t, [])
      await attemptElsewhere(t, melt, counter, "meltChange")

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toMatchObject({ type: "received" })
      expect((await attemptsOf(t, melt)).map((row) => row.isRejected)).toEqual([
        1,
      ])
    })

    test("a melt whose held proofs are unspent gives its pre-swap block to the receive", async () => {
      await using t = await createCashuTest()
      await fundTestCashuWallet(t, 100)
      const sources = (await loadTestCashuProofs(t.deps.evolu)).map(
        (proof) => proof.id
      )
      const { token, counter } = await lostSwap(t)
      const melt = await writeMeltElsewhere(t, sources)
      await runMutationWithCompletion((options) =>
        upsertTestCashuAttemptElsewhere(
          t.deps.evolu,
          {
            operationId: melt,
            keysetId: t.mint.keysetId,
            counter,
            role: "meltSwap",
            slots: 2 * CASHU_OUTPUT_BLOCK,
          },
          options
        )
      )

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toMatchObject({ type: "received" })
      expect((await attemptsOf(t, melt)).map((row) => row.isRejected)).toEqual([
        1,
      ])
    })
  })
  describe("a signature belongs to the operation whose block holds it (cashu/0031)", () => {
    test("a device's first use of the keyset leaves another device's lost swap to its receive, which books it", async () => {
      await using t = await createCashuTest()
      const customer = createTestCashuCustomer(t)
      // Another device swaps a token and loses the answer; its rows sync in.
      const theirs = await customer.token(8)
      const other = await t.otherDevice()
      t.mint.failNext("swap", { type: "lostResponse" })
      await using otherRun = testCreateRun(other)
      const lost = await otherRun(receiveCashuToken(await inspect(theirs.text)))
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      const theirId = (await inspect(theirs.text)).receiveOperationId
      await runMutationWithCompletion((options) => {
        upsertCashuOperationRow(
          t.deps.evolu,
          {
            id: theirId,
            kind: "receive",
            status: "pending",
            mintUrl: testMintUrl,
            amount: CashuAmount(8),
            keysetId: null,
          },
          options
        )
        t.deps.evolu.upsert(
          "cashuReceive",
          { id: theirId, tokenText: theirs.text, fee: NonNegativeInteger(0) },
          options
        )
      })
      await syncTestCashuAttempts(other.evolu, t.deps.evolu)

      // This device's first use of the keyset scans it.
      const mine = await customer.token(4)
      const received = await receive(t, mine.text)
      expect(received.ok && received.value).toMatchObject({ type: "received" })

      expect(await testCashuBalance(t.deps.evolu)).toBe(4)
      await using run = testCreateRun(t.deps)
      const [theirAttempt] = await run.ok(loadCashuAttempts(theirId))
      if (theirAttempt === undefined) throw new Error("no attempt")
      const reclaimed = await receiveTakingOver(t, theirs.text, theirAttempt.id)
      expect(reclaimed.ok && reclaimed.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
      expect((await run.ok(loadCashuReceive(theirId)))?.status).toBe("done")
      expect(await testCashuBalance(t.deps.evolu)).toBe(12)
    })

    test("orphans are not recovered before this device has synced, and are once it has", async () => {
      await using t = await createCashuTest()
      const customer = createTestCashuCustomer(t)
      // Another device topped up; none of its rows reached this device.
      const other = await t.otherDevice()
      await fundTestCashuWallet({ ...t, deps: other }, 100)
      const synced = { value: false }
      const deps = {
        ...t.deps,
        // Unsynced because a relay cannot be reached: blocked is no more
        // synced than pending (cashu/0013).
        appOwnerSync: {
          state: () =>
            synced.value
              ? { type: "complete" as const }
              : {
                  type: "blocked" as const,
                  unreachable: ["wss://down.example"],
                },
        },
      }
      const receiveWith = async (text: CashuTokenText) => {
        await using run = testCreateRun(deps)
        return await run(receiveCashuToken(await inspect(text)))
      }

      const before = await receiveWith((await customer.token(4)).text)
      expect(before.ok).toBe(true)
      expect(await testCashuBalance(t.deps.evolu)).toBe(4)

      synced.value = true
      const after = await receiveWith((await customer.token(4)).text)
      expect(after.ok).toBe(true)
      expect(await testCashuBalance(t.deps.evolu)).toBe(108)
    })
  })
  describe("a keyset id from outside is made operable before use (cashu/0035)", () => {
    test("a token naming a keyset the mint does not list stays undecodable, asking the mint once", async () => {
      await using t = await createCashuTest({
        extraMints: [{ url: "https://elsewhere.mint.test" }],
      })
      // Proofs of another mint's keyset, written as if this mint's.
      const elsewhere = t.others[0]
      if (elsewhere === undefined) throw new Error("no other mint")
      const foreign = await createTestCashuCustomer({
        deps: t.deps,
        mint: elsewhere,
      }).token(8)
      const { getEncodedToken } = await import("@cashu/cashu-ts")
      const text = CashuTokenText(
        getEncodedToken({
          mint: testMintUrl,
          proofs: [...foreign.proofs],
          unit: "sat",
        })
      )
      await using run = testCreateRun(t.deps)
      await run.orThrow(loadCashuWallet(testMintUrl))
      const keysetsBefore = t.mint.requestCount("keysets")

      const result = await receive(t, text)

      expect(!result.ok && result.error.type).toBe("TokenUndecodable")
      expect(t.mint.requestCount("keysets")).toBe(keysetsBefore + 1)
      expect(await operationCount(t)).toBe(0)
    })

    test("another device's lost swap in a keyset this wallet has not loaded is reclaimed", async () => {
      await using t = await createCashuTest()
      // This device's wallet is loaded, the mint rotates, and another
      // device swaps in the new keyset and loses the answer.
      await using run = testCreateRun(t.deps)
      await run.orThrow(loadCashuWallet(testMintUrl))
      t.mint.rotateKeyset()
      const token = await createTestCashuCustomer(t).token(8)
      const other = await t.otherDevice()
      t.mint.failNext("swap", { type: "lostResponse" })
      await using otherRun = testCreateRun(other)
      const lost = await otherRun(receiveCashuToken(await inspect(token.text)))
      expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
      const { receiveOperationId } = await inspect(token.text)
      await runMutationWithCompletion((options) => {
        upsertCashuOperationRow(
          t.deps.evolu,
          {
            id: receiveOperationId,
            kind: "receive",
            status: "pending",
            mintUrl: testMintUrl,
            amount: CashuAmount(8),
            keysetId: null,
          },
          options
        )
        t.deps.evolu.upsert(
          "cashuReceive",
          {
            id: receiveOperationId,
            tokenText: token.text,
            fee: NonNegativeInteger(0),
          },
          options
        )
      })
      await syncTestCashuAttempts(other.evolu, t.deps.evolu)
      const [theirs] = await run.ok(loadCashuAttempts(receiveOperationId))
      if (theirs === undefined) throw new Error("no attempt")

      const result = await receiveTakingOver(t, token.text, theirs.id)

      expect(result.ok && result.value).toEqual({
        type: "received",
        amount: 8,
        fee: 0,
      })
    })
  })
})
