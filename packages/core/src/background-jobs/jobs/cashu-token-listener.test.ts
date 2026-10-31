import type { Proof } from "@cashu/cashu-ts"
import { createIdFromString, testCreateRun } from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"
import { PrivateDirectMessage } from "nostr-tools/kinds"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"
import { decodeCashuPaymentPayload } from "../../cashu/cashu-payment-request.ts"
import { loadCashuWallet } from "../../cashu/cashu-wallet.ts"
import type { FakeMintEndpoint } from "../../cashu/fake-cashu-mint.ts"
import { createQuery } from "../../evolu/schema.ts"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import { saveCashuAccount } from "../../modules/account/account-actions.ts"
import { CLAIMED_ELSEWHERE_GRACE_MS } from "../../modules/cashu/cashu-guards.ts"
import {
  trustCashuMint,
  untrustCashuMint,
} from "../../modules/cashu/cashu-mint-actions.ts"
import { upsertCashuOperationRow } from "../../modules/cashu/cashu-proof-actions.ts"
import {
  cashuOperationAttemptsQuery,
  cashuTokenArrivalQuery,
} from "../../modules/cashu/cashu-queries.ts"
import {
  inspectCashuToken,
  receiveCashuToken,
} from "../../modules/cashu/cashu-receive-actions.ts"
import { upsertCashuTokenArrival } from "../../modules/cashu/cashu-token-arrival-actions.ts"
import { createCashuTopupQuote } from "../../modules/cashu/cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuTokenText,
  MintUrl,
} from "../../modules/cashu/cashu-types.ts"
import {
  cashuArrivalKeepsRequest,
  cashuMintTrustId,
  cashuReceiveOperationIdFor,
  MAIN_MINT_URL,
  normalizeCashuTokenText,
} from "../../modules/cashu/cashu-utils.ts"
import {
  createPayment,
  holdCashuReceive,
} from "../../modules/payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "../../modules/payment/payment-preparation-actions.ts"
import type { PaymentId } from "../../modules/payment/payment-types.ts"
import { runMutationWithCompletion } from "../../modules/shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "../../modules/shared/key-derivation.ts"
import { NonNegativeInteger } from "../../modules/shared/schema.ts"
import {
  createCashuTest,
  createTestCashuCustomer,
  loadTestCashuOperations,
  testCashuBalances,
  testCashuMasterKey,
  testMintUrl,
  upsertTestCashuAttemptElsewhere,
} from "../../testing/cashu.ts"
import { createFakeNostrDep } from "../../testing/nostr.ts"
import {
  advanceCashuTokenGraces,
  type CashuTokenCandidate,
  createCashuTokenListener,
  matchCashuToken,
  processCashuTokenMessage,
} from "./cashu-token-listener.ts"

const candidate = (
  paymentId: string,
  overrides: Partial<CashuTokenCandidate> = {}
): CashuTokenCandidate => ({
  paymentId: paymentId as PaymentId,
  open: true,
  ...overrides,
})

describe("matchCashuToken", () => {
  test("a payload goes to the open payment its id names", () => {
    expect(
      matchCashuToken({
        requestId: "a",
        candidates: [candidate("b"), candidate("a")],
      })
    ).toEqual({ type: "payment", paymentId: "a" })
  })

  test("a payload for a payment no longer open is received unassigned", () => {
    expect(
      matchCashuToken({
        requestId: "a",
        candidates: [candidate("a", { open: false })],
      })
    ).toEqual({ type: "unassigned" })
  })

  test("a payload naming no known payment is unassigned, not matched by amount", () => {
    expect(
      matchCashuToken({
        requestId: "unknown",
        candidates: [candidate("a")],
      })
    ).toEqual({ type: "unassigned" })
  })

  test("a bare token is unassigned, though one payment is open (cashu/0028)", () => {
    expect(
      matchCashuToken({ requestId: null, candidates: [candidate("a")] })
    ).toEqual({ type: "unassigned" })
  })
})

const receiveHoldsQuery = createQuery((db) =>
  db
    .selectFrom("paymentCashuReceiveHold")
    .select(["paymentId", "receiveOperationId"])
)

const claimsQuery = createQuery((db) =>
  db
    .selectFrom("reconciliationClaim")
    .select(["paymentId"])
    .where("isDeleted", "is not", 1)
)

const extraMint = MintUrl("https://extra.mint.test")

/**
 * A Cashu account whose default is the test mint, a second fake mint, one
 * prepared payment, and a fake relay.
 */
const setup = async (extraMints: ReadonlyArray<MintUrl> = [extraMint]) => {
  const t = await createCashuTest({
    extraMints: extraMints.map((url) => ({ url })),
  })
  const fakeNostr = createFakeNostrDep()
  const deps = {
    ...t.deps,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
      [testMintUrl, ...extraMints].some((mint) =>
        String(input).startsWith(mint)
      )
        ? t.deps.fetch(input, init)
        : new Response(
            JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
          ),
    ...createYadioApiDep(),
    nostr: fakeNostr.nostr,
  }
  await using run = testCreateRun(deps)
  const accountId = await run.ok(saveCashuAccount({ enabled: true }))
  if (accountId === null) throw new Error("no Cashu account")
  const paymentId = await run.orThrow(
    createPayment({
      deviceId: null,
      billId: null,
      tableId: null,
      amount: NonNegativeInteger(12_900),
      currency: "CZK",
      tipAmount: NonNegativeInteger(0),
      canceledAt: null,
      expiresAt: null,
    })
  )
  await run.orThrow(prepareCashuPaymentMethod({ paymentId, accountId }))
  return { t, deps, fakeNostr, paymentId }
}

type Setup = Awaited<ReturnType<typeof setup>>

/** A customer sends  to Payky's npub over NIP-17. */
const sendToPayky = (s: Setup, content: string) => {
  const payky = getPublicKey(deriveNostrSecretKey(testCashuMasterKey))
  const customer = generateSecretKey()
  s.fakeNostr.deliver(
    createWrap(
      createSeal(
        createRumor(
          {
            kind: PrivateDirectMessage,
            created_at: Math.floor(Date.now() / 1000),
            content,
            tags: [["p", payky]],
          },
          customer
        ),
        customer,
        payky
      ),
      payky
    )
  )
}

/**
 * The customer's NUT-18 payload for the payment, as the QR's request has it
 * sent (cashu/0028), and the token text Payky reads from it.
 */
const paymentPayload = (
  paymentId: PaymentId,
  token: { readonly proofs: ReadonlyArray<Proof> },
  mint: MintUrl = testMintUrl
) => {
  const content = JSON.stringify({
    id: paymentId,
    mint,
    unit: "sat",
    proofs: token.proofs.map((proof) => ({
      id: proof.id,
      amount: Number(proof.amount),
      secret: proof.secret,
      C: proof.C,
    })),
  })
  const text = normalizeCashuTokenText(content)
  if (text === null) throw new Error("no token text")
  return { content, text }
}

const listenOnce = async (s: Setup) => {
  await using run = testCreateRun(s.deps)
  const listener = createCashuTokenListener(run)
  await listener.start(() => undefined)
  await listener.tick()
  listener.stop()
}

/** A listener kept across ticks, over a clock the test moves. */
const listenTwice = async (
  s: Setup,
  between: () => Promise<void>,
  { advanceMs = 60_000 }: { readonly advanceMs?: number } = {}
) => {
  let nowMs: number = Date.now()
  await using run = testCreateRun({
    ...s.deps,
    date: { now: () => new Date(nowMs) },
  })
  const listener = createCashuTokenListener(run)
  await listener.start(() => undefined)
  await listener.tick()
  await between()
  const before = mintRequests(s)
  nowMs += advanceMs
  await listener.tick()
  listener.stop()
  return { secondPassRequests: mintRequests(s) - before }
}

const mintEndpoints: ReadonlyArray<FakeMintEndpoint> = [
  "info",
  "keysets",
  "keys",
  "swap",
  "checkstate",
  "restore",
]

const mintRequests = (s: Setup): number =>
  mintEndpoints.reduce(
    (sum, endpoint) => sum + s.t.mint.requestCount(endpoint),
    0
  )

/** Another Payky device's pending receive of the token, as it syncs in. */
const writeReceivePendingElsewhere = async (s: Setup, text: CashuTokenText) => {
  const id = cashuReceiveOperationIdFor(text)
  await runMutationWithCompletion((options) => {
    const owned = { ...options, owner: s.deps.evoluOwner }
    upsertCashuOperationRow(
      s.deps.evolu,
      {
        id,
        kind: "receive",
        status: "pending",
        mintUrl: testMintUrl,
        amount: CashuAmount(8600),
        keysetId: null,
      },
      owned
    )
    upsertTestCashuAttemptElsewhere(
      s.deps.evolu,
      {
        operationId: id,
        keysetId: s.t.mint.keysetId,
        counter: 7000,
        role: "swap",
      },
      owned
    )
    s.deps.evolu.upsert(
      "cashuReceive",
      { id, tokenText: text, fee: NonNegativeInteger(0) },
      owned
    )
  })
}

/** That device swaps the token at its attempt, and stores nothing here. */
const anotherDeviceSwapsAt7000 = async (s: Setup, text: CashuTokenText) => {
  const other = await s.t.otherDevice()
  const wallet = await other.cashuWallet.load(testMintUrl)
  await wallet.receive(text, undefined, {
    type: "deterministic",
    counter: 7000,
  })
}

/**
 * A token another device swapped at its attempt and left, its block shared
 * with a topup that device minted: taking the attempt over finds a contest.
 */
const sendContestedThroughTakeover = async (s: Setup) => {
  const token = await createTestCashuCustomer(s.t).token(8600)
  const sent = paymentPayload(s.paymentId, token)
  // Another device swapped the token at its attempt and is gone.
  await writeReceivePendingElsewhere(s, sent.text)
  await anotherDeviceSwapsAt7000(s, sent.text)
  // A topup it minted elsewhere shares that block: both could have signed.
  await using run = testCreateRun(s.deps)
  const quote = await run.orThrow(
    createCashuTopupQuote({
      mint: testMintUrl,
      amount: CashuAmount(100),
      purpose: "payment",
    })
  )
  s.t.mint.payMintQuote(quote.quoteId)
  const other = await s.t.otherDevice()
  const wallet = await other.cashuWallet.load(testMintUrl)
  await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
    type: "deterministic",
    counter: 9000,
  })
  await runMutationWithCompletion((options) =>
    upsertTestCashuAttemptElsewhere(
      s.deps.evolu,
      {
        operationId: quote.operationId,
        keysetId: s.t.mint.keysetId,
        counter: 7000,
        role: "mint",
      },
      { ...options, owner: s.deps.evoluOwner }
    )
  )
  sendToPayky(s, sent.content)
  return sent
}

const arrivalOf = async (s: Setup, paymentId: PaymentId) =>
  (await s.deps.evolu.loadQuery(cashuTokenArrivalQuery(paymentId)))[0]

describe("the token listener", () => {
  test("a token from a mint not trusted is not received and pays nothing (cashu/0016)", async () => {
    const s = await setup()
    await using _ = s.t
    sendToPayky(
      s,
      JSON.stringify({
        id: s.paymentId,
        mint: "https://rogue.mint",
        unit: "sat",
        proofs: [{ id: "00ad268c4d1f5826", amount: 8, secret: "s", C: "02aa" }],
      })
    )

    await listenOnce(s)

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("untrustedMint")
    expect(
      (await loadTestCashuOperations(s.deps.evolu)).filter(
        (operation) => operation.kind === "receive"
      )
    ).toEqual([])
    expect(
      (await s.deps.evolu.loadQuery(receiveHoldsQuery)).filter(
        (row) => row.paymentId === s.paymentId
      )
    ).toEqual([])
  })

  test("a token for the payment is received, booked and pays it; the wait screen sees it", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    sendToPayky(s, sent.content)

    await listenOnce(s)

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      amount: 8600,
      fee: 0,
    })
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
      { paymentId: s.paymentId },
    ])
  })

  test("a token from a trusted mint that is not the default is received and pays, its money staying there (cashu/0016)", async () => {
    const s = await setup()
    await using _ = s.t
    await using run = testCreateRun(s.deps)
    await run.orThrow(trustCashuMint(extraMint))
    const [extra] = s.t.others
    if (extra === undefined) throw new Error("no extra mint")
    const token = await createTestCashuCustomer({ ...s.t, mint: extra }).token(
      8600
    )
    const sent = paymentPayload(s.paymentId, token, extraMint)
    sendToPayky(s, sent.content)

    await listenOnce(s)

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      mintUrl: extraMint,
      amount: 8600,
    })
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
      { paymentId: s.paymentId },
    ])
    const balances = await testCashuBalances(s.deps.evolu)
    expect(balances.get(extraMint)).toBe(8600)
    expect(balances.get(testMintUrl) ?? 0).toBe(0)
  })

  test("a token from a mint untrusted after the payment was created is refused", async () => {
    const s = await setup()
    await using _ = s.t
    await using run = testCreateRun(s.deps)
    await run.orThrow(trustCashuMint(extraMint))
    const [extra] = s.t.others
    if (extra === undefined) throw new Error("no extra mint")
    const token = await createTestCashuCustomer({ ...s.t, mint: extra }).token(
      8600
    )
    const sent = paymentPayload(s.paymentId, token, extraMint)
    await run.orThrow(untrustCashuMint(extraMint))
    sendToPayky(s, sent.content)

    await listenOnce(s)

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("untrustedMint")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
  })

  test("a token from a mint not trusted yet is received on the next pass once the mint is trusted, no restart (cashu/0020)", async () => {
    const s = await setup()
    await using _ = s.t
    const [extra] = s.t.others
    if (extra === undefined) throw new Error("no extra mint")
    const token = await createTestCashuCustomer({ ...s.t, mint: extra }).token(
      8600
    )
    const sent = paymentPayload(s.paymentId, token, extraMint)
    sendToPayky(s, sent.content)

    await listenTwice(s, async () => {
      expect((await arrivalOf(s, s.paymentId))?.state).toBe("untrustedMint")
      await using run = testCreateRun(s.deps)
      await run.orThrow(trustCashuMint(extraMint))
    })

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      mintUrl: extraMint,
      amount: 8600,
    })
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
      { paymentId: s.paymentId },
    ])
  })

  test("a token from a mint still not trusted is re-checked against the trust list only: the next pass asks no mint (cashu/0020)", async () => {
    const s = await setup()
    await using _ = s.t
    const [extra] = s.t.others
    if (extra === undefined) throw new Error("no extra mint")
    const token = await createTestCashuCustomer({ ...s.t, mint: extra }).token(
      8600
    )
    const sent = paymentPayload(s.paymentId, token, extraMint)
    sendToPayky(s, sent.content)
    const extraRequests = () =>
      mintEndpoints.reduce(
        (sum, endpoint) => sum + extra.requestCount(endpoint),
        0
      )
    const before = extraRequests()

    const { secondPassRequests } = await listenTwice(s, async () => undefined)

    expect(secondPassRequests).toBe(0)
    expect(extraRequests() - before).toBe(0)
    expect((await arrivalOf(s, s.paymentId))?.state).toBe("untrustedMint")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
  })

  test("a device that knows no trusted mint receives no token, not even from MAIN_MINT_URL (cashu/0018, cashu/0020)", async () => {
    const s = await setup([MAIN_MINT_URL])
    await using _ = s.t
    // The account's trusted mints have not synced to this device.
    await runMutationWithCompletion((options) =>
      s.deps.evolu.update(
        "cashuMintTrust",
        { id: cashuMintTrustId, isDeleted: 1 },
        { ...options, owner: s.deps.evoluOwner }
      )
    )
    const [main] = s.t.others
    if (main === undefined) throw new Error("no MAIN_MINT_URL mint")
    const token = await createTestCashuCustomer({ ...s.t, mint: main }).token(
      8600
    )
    const sent = paymentPayload(s.paymentId, token, MAIN_MINT_URL)
    sendToPayky(s, sent.content)

    await listenOnce(s)

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("untrustedMint")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
  })

  test("a token Linky on the same npub received first leaves the payment unpaid and says so (cashu/0029)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    // Linky, quicker, swaps it into its own wallet.
    await token.wallet.receive(token.text)
    sendToPayky(s, sent.content)

    await listenTwice(
      s,
      async () => {
        // Checked for the grace first: another Payky device may have it
        // (cashu/0030).
        expect((await arrivalOf(s, s.paymentId))?.state).toBe(
          "checkingElsewhere"
        )
      },
      { advanceMs: CLAIMED_ELSEWHERE_GRACE_MS }
    )

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("receivedElsewhere")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
    expect(
      (await loadTestCashuOperations(s.deps.evolu)).filter(
        (operation) => operation.kind === "receive"
      )
    ).toEqual([])
  })

  describe("a token spent elsewhere is concluded on facts, and woken by one (cashu/0030)", () => {
    /** A listener over a clock the test moves, counting its wake-ups. */
    const listenerOver = async (s: Setup) => {
      const clock: { ms: number } = { ms: Date.now() }
      const run = testCreateRun({
        ...s.deps,
        date: { now: () => new Date(clock.ms) },
      })
      const listener = createCashuTokenListener(run)
      const wakes = { count: 0 }
      await listener.start(() => {
        wakes.count += 1
      })
      return {
        clock,
        listener,
        wakes,
        pass: async (advanceMs = 0) => {
          clock.ms += advanceMs
          await listener.tick()
          return (await arrivalOf(s, s.paymentId))?.state
        },
        [Symbol.asyncDispose]: async () => {
          listener.stop()
          await run[Symbol.asyncDispose]()
        },
      }
    }

    test("a token spent elsewhere sleeps once said so: no pass asks the mint until a fact arrives", async () => {
      const s = await setup()
      await using _ = s.t
      const token = await createTestCashuCustomer(s.t).token(8600)
      const sent = paymentPayload(s.paymentId, token)
      sendToPayky(s, sent.content)
      // Linky swaps it between Payky's NUT-07 check and its swap.
      s.t.mint.failNext("swap", {
        type: "error",
        code: 11001,
        detail: "Token already spent.",
      })
      await using l = await listenerOver(s)

      expect(await l.pass()).toBe("checkingElsewhere")
      await token.wallet.receive(token.text)
      const before = mintRequests(s)
      expect(await l.pass(60_000)).toBe("checkingElsewhere")
      expect(mintRequests(s)).toBe(before)
      expect(await l.pass(CLAIMED_ELSEWHERE_GRACE_MS)).toBe("receivedElsewhere")
      const asleep = mintRequests(s)
      expect(await l.pass(CLAIMED_ELSEWHERE_GRACE_MS)).toBe("receivedElsewhere")
      expect(mintRequests(s)).toBe(asleep)
      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
    })

    test("another device's attempt arriving after the token was said spent elsewhere wakes it, and its swap is reclaimed", async () => {
      const s = await setup()
      await using _ = s.t
      const token = await createTestCashuCustomer(s.t).token(8600)
      const sent = paymentPayload(s.paymentId, token)
      // Another device swapped the token and lost the answer; its attempt
      // has not synced in.
      await anotherDeviceSwapsAt7000(s, sent.text)
      sendToPayky(s, sent.content)
      await using l = await listenerOver(s)
      expect(await l.pass()).toBe("checkingElsewhere")
      expect(await l.pass(CLAIMED_ELSEWHERE_GRACE_MS)).toBe("receivedElsewhere")
      const wakesBefore = l.wakes.count

      // Its attempt syncs in.
      await writeReceivePendingElsewhere(s, sent.text)

      await expect.poll(() => l.wakes.count).toBeGreaterThan(wakesBefore)
      expect(await l.pass()).toBe("receivingElsewhere")
      // Taken over past the grace. The payment has expired by then, and
      // still shows it: it holds the receive (cashu/0034).
      expect(await l.pass(CLAIMED_ELSEWHERE_GRACE_MS)).toBe("received")
      expect((await testCashuBalances(s.deps.evolu)).get(testMintUrl)).toBe(
        8600
      )
    })
  })

  describe("a token's arrival is shown on the payment holding its receive (cashu/0034)", () => {
    /** Past the Cashu quote's expiry, and with it the payment's. */
    const pastExpiryMs = 11 * 60_000

    test("an outcome reached after the payment expired is still shown on it", async () => {
      const s = await setup()
      await using _ = s.t
      const token = await createTestCashuCustomer(s.t).token(8600)
      const sent = paymentPayload(s.paymentId, token)
      // Linky, quicker, swaps it into its own wallet.
      await token.wallet.receive(token.text)
      sendToPayky(s, sent.content)

      await listenTwice(
        s,
        async () => {
          expect((await arrivalOf(s, s.paymentId))?.state).toBe(
            "checkingElsewhere"
          )
        },
        { advanceMs: pastExpiryMs }
      )

      expect((await arrivalOf(s, s.paymentId))?.state).toBe("receivedElsewhere")
    })

    test("a token another device booked after the payment expired is shown received on it, and claimed", async () => {
      const s = await setup()
      await using _ = s.t
      const token = await createTestCashuCustomer(s.t).token(8600)
      const sent = paymentPayload(s.paymentId, token)
      const payload = decodeCashuPaymentPayload(sent.content)
      if (payload === null) throw new Error("no payload")
      const message = {
        rumorId: "rumor",
        sender: "customer",
        sentAt: 0,
        tokenText: sent.text,
        payload,
      }
      // The payment holds the receive; the mint is down, so it waits.
      s.t.mint.failNext("swap", { type: "unreachable" })
      await using run = testCreateRun(s.deps)
      await run.ok(processCashuTokenMessage(message))
      expect((await arrivalOf(s, s.paymentId))?.state).toBe("waitingForMint")
      // Another device, which has not seen the payment, receives and books
      // the token; its rows sync in.
      await run.ok(
        processCashuTokenMessage({
          ...message,
          payload: { ...payload, requestId: "a payment not synced yet" },
        })
      )

      // The payment has expired by the next pass.
      await using later = testCreateRun({
        ...s.deps,
        date: { now: () => new Date(Date.now() + pastExpiryMs) },
      })
      const outcome = await later.ok(processCashuTokenMessage(message))

      expect(outcome).toEqual({ type: "settled" })
      expect(await arrivalOf(s, s.paymentId)).toMatchObject({
        state: "received",
        amount: 8600,
      })
      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
        { paymentId: s.paymentId },
      ])
    })

    test("a booking no device claimed is claimed by the pass that shows it on the expired payment holding its receive", async () => {
      const s = await setup()
      await using _ = s.t
      const token = await createTestCashuCustomer(s.t).token(8600)
      const sent = paymentPayload(s.paymentId, token)
      const payload = decodeCashuPaymentPayload(sent.content)
      if (payload === null) throw new Error("no payload")
      const message = {
        rumorId: "rumor",
        sender: "customer",
        sentAt: 0,
        tokenText: sent.text,
        payload,
      }
      await using run = testCreateRun(s.deps)
      // Another device, which had seen neither the payment nor its hold,
      // received and booked the token unclaimed; its rows sync in.
      await run.ok(
        processCashuTokenMessage({
          ...message,
          payload: { ...payload, requestId: "a payment not synced yet" },
        })
      )
      // This device's earlier pass held the receive for the payment.
      const receiveOperationId = cashuReceiveOperationIdFor(sent.text)
      await run.ok(
        holdCashuReceive({ paymentId: s.paymentId, receiveOperationId })
      )
      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])

      await using later = testCreateRun({
        ...s.deps,
        date: { now: () => new Date(Date.now() + pastExpiryMs) },
      })
      await later.ok(processCashuTokenMessage(message))

      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
        { paymentId: s.paymentId },
      ])
      expect((await arrivalOf(s, s.paymentId))?.state).toBe("received")
    })

    test("a booked token sent again for another open payment is neither held by it nor shown received on it", async () => {
      const s = await setup()
      await using _ = s.t
      const token = await createTestCashuCustomer(s.t).token(8600)
      sendToPayky(s, paymentPayload(s.paymentId, token).content)
      await listenOnce(s)
      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
        { paymentId: s.paymentId },
      ])
      // A second payment, open, and the same token sent with its id.
      await using run = testCreateRun(s.deps)
      const accountId = await run.ok(saveCashuAccount({ enabled: true }))
      if (accountId === null) throw new Error("no Cashu account")
      const second = await run.orThrow(
        createPayment({
          deviceId: null,
          billId: null,
          tableId: null,
          amount: NonNegativeInteger(12_900),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
        })
      )
      await run.orThrow(
        prepareCashuPaymentMethod({ paymentId: second, accountId })
      )
      const resent = paymentPayload(second, token)
      const payload = decodeCashuPaymentPayload(resent.content)
      if (payload === null) throw new Error("no payload")

      const outcome = await run.ok(
        processCashuTokenMessage({
          rumorId: "rumor again",
          sender: "customer",
          sentAt: 0,
          tokenText: resent.text,
          payload,
        })
      )

      expect(outcome).toEqual({ type: "settled" })
      expect(await arrivalOf(s, second)).toBeUndefined()
      expect(
        (await s.deps.evolu.loadQuery(receiveHoldsQuery)).map(
          (hold) => hold.paymentId
        )
      ).toEqual([s.paymentId])
      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
        { paymentId: s.paymentId },
      ])
    })

    /** A second open payment, prepared for Cashu as the first one is. */
    const createSecondPayment = async (s: Setup) => {
      await using run = testCreateRun(s.deps)
      const accountId = await run.ok(saveCashuAccount({ enabled: true }))
      if (accountId === null) throw new Error("no Cashu account")
      const second = await run.orThrow(
        createPayment({
          deviceId: null,
          billId: null,
          tableId: null,
          amount: NonNegativeInteger(12_900),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
        })
      )
      await run.orThrow(
        prepareCashuPaymentMethod({ paymentId: second, accountId })
      )
      return second
    }
    /** The token's message as sent with `paymentId`'s NUT-18 request. */
    const messageFor = (
      paymentId: PaymentId,
      token: { readonly proofs: ReadonlyArray<Proof> }
    ) => {
      const sent = paymentPayload(paymentId, token)
      const payload = decodeCashuPaymentPayload(sent.content)
      if (payload === null) throw new Error("no payload")
      return {
        rumorId: `rumor ${paymentId}`,
        sender: "customer",
        sentAt: 0,
        tokenText: sent.text,
        payload,
      }
    }

    test("a payment whose hidden QR waited on a token booked for another payment gets its QR back", async () => {
      const s = await setup()
      await using _ = s.t
      const second = await createSecondPayment(s)
      const token = await createTestCashuCustomer(s.t).token(8600)
      const first = messageFor(s.paymentId, token)
      const again = messageFor(second, token)
      const receiveOperationId = cashuReceiveOperationIdFor(first.tokenText)
      await using run = testCreateRun(s.deps)
      // The token, sent for both payments, is held by both. Passes on both
      // messages found the receive under way on another device, and hid
      // both payments' QRs.
      for (const paymentId of [s.paymentId, second]) {
        await run.ok(holdCashuReceive({ paymentId, receiveOperationId }))
        await runMutationWithCompletion((options) =>
          upsertCashuTokenArrival(
            s.deps.evolu,
            {
              paymentId,
              mintUrl: testMintUrl,
              amount: CashuAmount(8600),
              fee: null,
              state: "receivingElsewhere",
              failure: null,
            },
            { ...options, owner: s.deps.evoluOwner }
          )
        )
      }
      // The receive is booked and claimed for one of them.
      await run.ok(processCashuTokenMessage(first))
      const [claim] = await s.deps.evolu.loadQuery(claimsQuery)
      const [claimed, unclaimed] =
        claim?.paymentId === second
          ? [second, s.paymentId]
          : [s.paymentId, second]

      expect(
        await run.ok(
          processCashuTokenMessage(unclaimed === second ? again : first)
        )
      ).toEqual({ type: "settled" })

      const arrival = await arrivalOf(s, unclaimed)
      expect(arrival?.state).not.toBe("received")
      expect(
        arrival === undefined || cashuArrivalKeepsRequest(arrival.state)
      ).toBe(true)
      expect(await run.ok(processCashuTokenMessage(again))).toEqual({
        type: "settled",
      })
      expect((await arrivalOf(s, claimed))?.state).toBe("received")
      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
        { paymentId: claimed },
      ])
    })

    test("a token received for a payment whose booking another payment claims is not shown received on it", async () => {
      const s = await setup()
      await using _ = s.t
      const second = await createSecondPayment(s)
      // Of two payments holding a receive, the booking is claimed for the
      // one whose id sorts first.
      const [claimed, unclaimed] = [s.paymentId, second].toSorted()
      if (claimed === undefined || unclaimed === undefined)
        throw new Error("no payments")
      const token = await createTestCashuCustomer(s.t).token(8600)
      const message = messageFor(unclaimed, token)
      const receiveOperationId = cashuReceiveOperationIdFor(message.tokenText)
      await using run = testCreateRun(s.deps)
      // The other payment's hold, written by a device whose swap never went
      // out, has synced in; this device receives the token for this one.
      await run.ok(holdCashuReceive({ paymentId: claimed, receiveOperationId }))

      expect(await run.ok(processCashuTokenMessage(message))).toEqual({
        type: "settled",
      })

      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
        { paymentId: claimed },
      ])
      const arrival = await arrivalOf(s, unclaimed)
      expect(arrival?.state).not.toBe("received")
      expect(
        arrival === undefined || cashuArrivalKeepsRequest(arrival.state)
      ).toBe(true)
    })

    test("a token that first arrives after the payment expired shows nothing on it", async () => {
      const s = await setup()
      await using _ = s.t
      const token = await createTestCashuCustomer(s.t).token(8600)
      const sent = paymentPayload(s.paymentId, token)
      sendToPayky(s, sent.content)
      await using run = testCreateRun({
        ...s.deps,
        date: { now: () => new Date(Date.now() + pastExpiryMs) },
      })
      const listener = createCashuTokenListener(run)
      await listener.start(() => undefined)

      await listener.tick()
      listener.stop()

      expect(await arrivalOf(s, s.paymentId)).toBeUndefined()
      expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
    })
  })

  test("a tick that was running when the listener stopped leaves no state behind: started again, the message is worked on at once (cashu/0030)", async () => {
    const s = await setup()
    await using _ = s.t
    await using run = testCreateRun(s.deps)
    const token = await createTestCashuCustomer(s.t).token(8600)
    sendToPayky(s, paymentPayload(s.paymentId, token).content)
    const listener = createCashuTokenListener(run)
    await listener.start(() => undefined)
    // Cashu is switched off while the tick asks the mint, which is down.
    s.t.mint.failNext("checkstate", {
      type: "then",
      run: () => listener.stop(),
    })
    s.t.mint.failNext("swap", { type: "unreachable" })
    await listener.tick()

    await listener.start(() => undefined)
    await listener.tick()
    listener.stop()

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("received")
  })

  test("while stopped, the Cashu account disabled, a loaded message is not worked on; started again, it is received (cashu/0030)", async () => {
    const s = await setup()
    await using _ = s.t
    let nowMs: number = Date.now()
    await using run = testCreateRun({
      ...s.deps,
      date: { now: () => new Date(nowMs) },
    })
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    sendToPayky(s, sent.content)
    // The mint is down, so the message is still unsettled when Cashu is
    // switched off.
    s.t.mint.failNext("swap", { type: "unreachable" })
    const listener = createCashuTokenListener(run)
    await listener.start(() => undefined)
    await listener.tick()
    expect((await arrivalOf(s, s.paymentId))?.state).toBe("waitingForMint")

    listener.stop()
    const before = mintRequests(s)
    nowMs += 60_000
    await listener.tick()
    expect(mintRequests(s) - before).toBe(0)
    expect((await arrivalOf(s, s.paymentId))?.state).toBe("waitingForMint")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])

    await listener.start(() => undefined)
    await listener.tick()
    listener.stop()
    expect((await arrivalOf(s, s.paymentId))?.state).toBe("received")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
      { paymentId: s.paymentId },
    ])
  })

  test("a token another Payky device has pending is tried again, and received from its attempt once taken over past the grace (cashu/0029, 0017)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    await writeReceivePendingElsewhere(s, sent.text)
    sendToPayky(s, sent.content)

    await listenTwice(
      s,
      async () => {
        // Meanwhile the wait screen hides the QR: that device may pay the
        // payment (cashu/0020).
        expect((await arrivalOf(s, s.paymentId))?.state).toBe(
          "receivingElsewhere"
        )
        // That device swaps at its attempt and is gone before it stores
        // the proofs.
        await anotherDeviceSwapsAt7000(s, sent.text)
      },
      { advanceMs: CLAIMED_ELSEWHERE_GRACE_MS }
    )

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      amount: 8600,
    })
  })

  test("another Payky device's attempt is left to it within the grace (cashu/0017)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    await writeReceivePendingElsewhere(s, sent.text)
    await anotherDeviceSwapsAt7000(s, sent.text)
    sendToPayky(s, sent.content)

    await listenTwice(s, async () => undefined, {
      advanceMs: CLAIMED_ELSEWHERE_GRACE_MS - 1,
    })

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("receivingElsewhere")
    expect((await testCashuBalances(s.deps.evolu)).size).toBe(0)
  })

  test("a token another Payky device booked before the payment reached it is held and claimed by the payment its payload names (cashu/0025)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const content = JSON.stringify({
      id: s.paymentId,
      mint: testMintUrl,
      unit: "sat",
      proofs: token.proofs.map((proof) => ({
        id: proof.id,
        amount: Number(proof.amount),
        secret: proof.secret,
        C: proof.C,
      })),
    })
    const payload = decodeCashuPaymentPayload(content)
    const tokenText = normalizeCashuTokenText(content)
    if (payload === null || tokenText === null) throw new Error("no payload")
    const message = {
      rumorId: "rumor",
      sender: "customer",
      sentAt: 0,
      tokenText,
      payload,
    }
    await using run = testCreateRun(s.deps)
    // Another device, which has not seen the payment yet, receives and books
    // the token unassigned; its rows sync in.
    await run.ok(
      processCashuTokenMessage({
        ...message,
        payload: { ...payload, requestId: "a payment not synced yet" },
      })
    )
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])

    const outcome = await run.ok(processCashuTokenMessage(message))

    expect(outcome).toEqual({ type: "settled" })
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
      { paymentId: s.paymentId },
    ])
    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      amount: 8600,
    })
  })

  test("a bare token is received and booked unassigned, though an open payment has its face amount (cashu/0028)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    sendToPayky(s, token.text)

    await listenOnce(s)

    expect(
      (await loadTestCashuOperations(s.deps.evolu)).filter(
        (operation) => operation.kind === "receive"
      )
    ).toEqual([expect.objectContaining({ status: "done", amount: 8600 })])
    expect((await testCashuBalances(s.deps.evolu)).get(testMintUrl)).toBe(8600)
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
    expect(await arrivalOf(s, s.paymentId)).toBeUndefined()
    expect(
      (await s.deps.evolu.loadQuery(receiveHoldsQuery)).filter(
        (row) => row.paymentId === s.paymentId
      )
    ).toEqual([])
  })

  test("a bare token another device booked is not given to a payment by its amount alone (cashu/0025)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    // Booked unassigned before this payment of the same amount existed here.
    await using run = testCreateRun(s.deps)
    const inspected = await inspectCashuToken(
      token.text,
      bytesToHex(deriveNostrSecretKey(testCashuMasterKey))
    )
    if (!inspected.ok) throw new Error(inspected.error.type)
    await run.orThrow(receiveCashuToken(inspected.value))
    sendToPayky(s, token.text)

    await listenOnce(s)

    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
    expect(await arrivalOf(s, s.paymentId)).toBeUndefined()
  })

  test("a mint refusal writes no failed and is asked once a run (cashu/0030)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    sendToPayky(s, sent.content)
    s.t.mint.failNext("swap", {
      type: "error",
      code: 10003,
      detail: "could not verify proofs",
    })

    const { secondPassRequests } = await listenTwice(s, async () => {})

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("failed")
    expect(secondPassRequests).toBe(0)
    expect(
      (await loadTestCashuOperations(s.deps.evolu))
        .filter((row) => row.kind === "receive")
        .map((row) => row.status)
    ).toEqual(["pending"])
  })

  test("a swap whose answer could not be read is tried again, and its outputs received without a restart (cashu/0030)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    sendToPayky(s, sent.content)
    // The mint signs, and its answer does not parse.
    s.t.mint.failNext("swap", { type: "garbledResponse" })

    await listenTwice(s, async () => {
      expect((await arrivalOf(s, s.paymentId))?.state).toBe("waitingForMint")
    })

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      amount: 8600,
    })
    expect(s.t.mint.requestCount("swap")).toBe(1)
  })

  test("a mint that rotated its keyset under a loaded wallet: the token is received without a restart (cashu/0035)", async () => {
    const s = await setup()
    await using _ = s.t
    // The wallet is loaded, and then the mint rotates.
    await using run = testCreateRun(s.deps)
    await run.orThrow(loadCashuWallet(testMintUrl))
    s.t.mint.rotateKeyset()
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    sendToPayky(s, sent.content)

    await listenTwice(s, async () => {})

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      amount: 8600,
    })
  })

  test("inputs pending is tried again on the next pass (cashu/0030)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    sendToPayky(s, sent.content)
    // Another call is spending the token while this device swaps.
    s.t.mint.failNext("swap", {
      type: "error",
      code: 11000,
      detail: "proofs are pending",
    })

    await listenTwice(s, async () => {
      expect((await arrivalOf(s, s.paymentId))?.state).toBe("receiving")
    })

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      amount: 8600,
    })
  })

  test("a contest reached only by taking another device's attempt over is settled past its grace (cashu/0029)", async () => {
    const s = await setup()
    await using _ = s.t
    const sent = await sendContestedThroughTakeover(s)
    let nowMs: number = Date.now()
    await using listenerRun = testCreateRun({
      ...s.deps,
      date: { now: () => new Date(nowMs) },
    })
    const listener = createCashuTokenListener(listenerRun)
    await listener.start(() => undefined)

    // Left to that device, then taken over and found contested, then given
    // to no one a grace later, on the payment though it has expired by then
    // (cashu/0034).
    const states: Array<string | undefined> = []
    for (let pass = 0; pass < 3; pass += 1) {
      await listener.tick()
      states.push((await arrivalOf(s, s.paymentId))?.state)
      nowMs += CLAIMED_ELSEWHERE_GRACE_MS
    }
    listener.stop()

    expect(states).toEqual([
      "receivingElsewhere",
      "receivingElsewhere",
      "contested",
    ])
    expect(
      (
        await s.deps.evolu.loadQuery(
          cashuOperationAttemptsQuery(cashuReceiveOperationIdFor(sent.text))
        )
      ).map((row) => row.isRejected)
    ).toEqual([1])
    expect((await testCashuBalances(s.deps.evolu)).get(testMintUrl)).toBe(8600)
  })

  describe("a grace counts on through passes the mint did not answer (cashu/0017)", () => {
    const unanswered = { type: "retryLater" } as const
    const attemptId = (name: string) =>
      createIdFromString<"CashuOperationAttempt">(name)

    test("a pass the mint did not answer leaves every grace where it was", () => {
      const graces = {
        elsewhere: { attemptId: attemptId("a"), ms: 1 },
        contested: 2,
      }
      expect(advanceCashuTokenGraces(graces, unanswered, 99)).toBe(graces)
      expect(advanceCashuTokenGraces({ spent: 3 }, unanswered, 99)).toEqual({
        spent: 3,
      })
    })

    test("another device's attempt keeps its grace, and a newer one starts it again", () => {
      const graces = { elsewhere: { attemptId: attemptId("a"), ms: 1 } }
      expect(
        advanceCashuTokenGraces(
          graces,
          { type: "receivingElsewhere", attemptId: attemptId("a") },
          99
        )
      ).toEqual(graces)
      expect(
        advanceCashuTokenGraces(
          { ...graces, contested: 2, spent: 3 },
          { type: "receivingElsewhere", attemptId: attemptId("b") },
          99
        )
      ).toEqual({ elsewhere: { attemptId: attemptId("b"), ms: 99 } })
    })

    test("a contest keeps the takeover it was reached through", () => {
      const elsewhere = { attemptId: attemptId("a"), ms: 1 }
      expect(
        advanceCashuTokenGraces(
          { elsewhere, spent: 3 },
          { type: "contestPending" },
          99
        )
      ).toEqual({ elsewhere, contested: 99 })
      expect(
        advanceCashuTokenGraces(
          { elsewhere, contested: 2 },
          { type: "contestPending" },
          99
        )
      ).toEqual({ elsewhere, contested: 2 })
    })

    test("a token spent elsewhere ends the other graces, and a settled message every one", () => {
      expect(
        advanceCashuTokenGraces(
          { elsewhere: { attemptId: attemptId("a"), ms: 1 }, contested: 2 },
          {
            type: "spentElsewhere",
            operationId: createIdFromString<"CashuOperation">("op"),
          },
          99
        )
      ).toEqual({ spent: 99 })
      expect(
        advanceCashuTokenGraces(
          { contested: 2, spent: 3 },
          { type: "settled" },
          99
        )
      ).toEqual({})
    })

    test("another device's attempt is taken over past the grace though a pass between found the mint unreachable", async () => {
      const s = await setup()
      await using _ = s.t
      const token = await createTestCashuCustomer(s.t).token(8600)
      const sent = paymentPayload(s.paymentId, token)
      await writeReceivePendingElsewhere(s, sent.text)
      sendToPayky(s, sent.content)
      let nowMs: number = Date.now()
      await using listenerRun = testCreateRun({
        ...s.deps,
        date: { now: () => new Date(nowMs) },
      })
      const listener = createCashuTokenListener(listenerRun)
      await listener.start(() => undefined)

      await listener.tick()
      await anotherDeviceSwapsAt7000(s, sent.text)
      nowMs += CLAIMED_ELSEWHERE_GRACE_MS / 2
      s.t.mint.failNext("checkstate", { type: "unreachable" })
      await listener.tick()
      expect((await arrivalOf(s, s.paymentId))?.state).toBe("waitingForMint")
      nowMs += CLAIMED_ELSEWHERE_GRACE_MS / 2
      await listener.tick()
      listener.stop()

      expect(await arrivalOf(s, s.paymentId)).toMatchObject({
        state: "received",
        amount: 8600,
      })
    })

    test("a contest is given to no one past its grace though a pass between found the mint unreachable", async () => {
      const s = await setup()
      await using _ = s.t
      await sendContestedThroughTakeover(s)
      let nowMs: number = Date.now()
      await using listenerRun = testCreateRun({
        ...s.deps,
        date: { now: () => new Date(nowMs) },
      })
      const listener = createCashuTokenListener(listenerRun)
      await listener.start(() => undefined)

      // Left to that device, then taken over and found contested.
      await listener.tick()
      nowMs += CLAIMED_ELSEWHERE_GRACE_MS
      await listener.tick()
      nowMs += CLAIMED_ELSEWHERE_GRACE_MS / 2
      s.t.mint.failNext("checkstate", { type: "unreachable" })
      await listener.tick()
      expect((await arrivalOf(s, s.paymentId))?.state).toBe("waitingForMint")
      nowMs += CLAIMED_ELSEWHERE_GRACE_MS / 2
      await listener.tick()
      listener.stop()

      expect((await arrivalOf(s, s.paymentId))?.state).toBe("contested")
      expect((await testCashuBalances(s.deps.evolu)).get(testMintUrl)).toBe(
        8600
      )
    })
  })

  test("a contested block is shown on the payment, and the message is settled (cashu/0029)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    const sent = paymentPayload(s.paymentId, token)
    // This device swapped the token and lost the answer.
    s.t.mint.failNext("swap", { type: "lostResponse" })
    const inspected = await inspectCashuToken(
      sent.text,
      bytesToHex(deriveNostrSecretKey(testCashuMasterKey))
    )
    if (!inspected.ok) throw new Error(inspected.error.type)
    await using run = testCreateRun(s.deps)
    const lost = await run(receiveCashuToken(inspected.value))
    expect(!lost.ok && lost.error.type).toBe("MintUnreachable")
    const [own] = await s.deps.evolu.loadQuery(
      cashuOperationAttemptsQuery(inspected.value.receiveOperationId)
    )
    if (own === undefined) throw new Error("no attempt")
    // Another device reserved the same block for a topup, whose quote it
    // minted elsewhere: both could have signed the block.
    const quote = await run.orThrow(
      createCashuTopupQuote({
        mint: testMintUrl,
        amount: CashuAmount(100),
        purpose: "payment",
      })
    )
    s.t.mint.payMintQuote(quote.quoteId)
    const other = await s.t.otherDevice()
    const wallet = await other.cashuWallet.load(testMintUrl)
    await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
      type: "deterministic",
      counter: 9000,
    })
    await runMutationWithCompletion((options) =>
      upsertTestCashuAttemptElsewhere(
        s.deps.evolu,
        {
          operationId: quote.operationId,
          keysetId: s.t.mint.keysetId,
          counter: own.counter,
          role: "mint",
        },
        { ...options, owner: s.deps.evoluOwner }
      )
    )
    sendToPayky(s, sent.content)

    await listenTwice(
      s,
      async () => {
        expect((await arrivalOf(s, s.paymentId))?.state).toBe(
          "receivingElsewhere"
        )
      },
      { advanceMs: CLAIMED_ELSEWHERE_GRACE_MS }
    )

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("contested")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
    expect((await testCashuBalances(s.deps.evolu)).get(testMintUrl)).toBe(8600)
  })
})
