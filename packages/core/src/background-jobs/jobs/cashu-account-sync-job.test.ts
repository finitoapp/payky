import { createConsole, sqliteTrue, testCreateRun } from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"
import { PrivateDirectMessage } from "nostr-tools/kinds"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"
import { createCashuWalletDep } from "../../cashu/cashu-wallet.ts"
import type { FakeCashuMintOptions } from "../../cashu/fake-cashu-mint.ts"
import { createEetApiDep } from "../../integrations/eet/eet-client.ts"
import { createQerkoApiDep } from "../../integrations/qerko/qerko-client.ts"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import { saveCashuAccount } from "../../modules/account/account-actions.ts"
import { accountTransactionExistsQuery } from "../../modules/account-transaction/account-transaction-queries.ts"
import { deriveCashuAccountTransactionId } from "../../modules/account-transaction/account-transaction-utils.ts"
import { CLAIMED_ELSEWHERE_GRACE_MS } from "../../modules/cashu/cashu-guards.ts"
import {
  meltCashu,
  quoteCashuMelt,
} from "../../modules/cashu/cashu-melt-actions.ts"
import {
  toWalletProofs,
  updateCashuOperation,
  upsertCashuOperationRow,
} from "../../modules/cashu/cashu-proof-actions.ts"
import {
  cashuMeltQuery,
  cashuOperationAttemptsQuery,
  cashuTrustedMintsQuery,
  heldCashuProofsOfOperationQuery,
} from "../../modules/cashu/cashu-queries.ts"
import {
  inspectCashuToken,
  receiveCashuToken,
} from "../../modules/cashu/cashu-receive-actions.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
  upsertCashuTopupRows,
} from "../../modules/cashu/cashu-topup-actions.ts"
import {
  CashuAmount,
  CashuBolt11Schema,
} from "../../modules/cashu/cashu-types.ts"
import {
  MAIN_MINT_URL,
  trustedCashuMintsOf,
} from "../../modules/cashu/cashu-utils.ts"
import type { DeviceId } from "../../modules/device/device-types.ts"
import {
  createPayment,
  holdCashuReceive,
} from "../../modules/payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "../../modules/payment/payment-preparation-actions.ts"
import { paymentClaimsQuery } from "../../modules/payment/payment-queries.ts"
import type { PaymentId } from "../../modules/payment/payment-types.ts"
import { runMutationWithCompletion } from "../../modules/shared/evolu-utils.ts"
import {
  CashuWalletSeed,
  deriveNostrSecretKey,
} from "../../modules/shared/key-derivation.ts"
import { NonNegativeInteger, TimestampMs } from "../../modules/shared/schema.ts"
import {
  createCashuTest,
  createTestCashuCustomer,
  fundTestCashuWallet,
  loadTestCashuOperations,
  testCashuBalance,
  testCashuMasterKey,
  testMintUrl,
  upsertTestCashuAttemptElsewhere,
} from "../../testing/cashu.ts"
import { createFakeNostrDep } from "../../testing/nostr.ts"
import type { CashuBackgroundJobContext } from "../background-job-types.ts"
import {
  createCashuAccountSync,
  createCashuAccountSyncJob,
  startCashuAccountSyncJob,
} from "./cashu-account-sync-job.ts"

/** The job's context over `t`'s device, failures collected in `errors`. */
const createJobDeps = (t: Awaited<ReturnType<typeof createCashuTest>>) => {
  const dateDep = { date: { now: () => new Date() } }
  const fetchDep = {
    fetch: async () =>
      new Response(
        JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
      ),
  }
  const errors: unknown[] = []
  const relays = createFakeNostrDep()
  const deps: CashuBackgroundJobContext & ReturnType<typeof createYadioApiDep> =
    {
      ...t.deps,
      ...dateDep,
      ...fetchDep,
      ...createYadioApiDep(),
      ...createQerkoApiDep({ posId: "test" }),
      ...createEetApiDep({ ...dateDep, ...fetchDep }),
      masterKey: testCashuMasterKey,
      nostr: relays.nostr,
      console: createConsole({ level: "silent" }),
      deviceId: "device" as DeviceId,
      connectivity: { onOnline: () => () => {} },
      onError: (error) => {
        errors.push(error)
      },
    }
  return { deps, errors, relays }
}

const setup = async ({
  mint = {},
}: {
  readonly mint?: Partial<FakeCashuMintOptions>
} = {}) => {
  const t = await createCashuTest({ mint })
  const { deps, errors, relays } = createJobDeps(t)
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
  return { t, deps, errors, relays, paymentId }
}

const waitForClaim = (deps: CashuBackgroundJobContext, paymentId: PaymentId) =>
  expect
    .poll(() => deps.evolu.loadQuery(paymentClaimsQuery(paymentId)), {
      timeout: 15_000,
      interval: 200,
    })
    .toHaveLength(1)

/**
 * The job's passes over `run`, as its tick would make them, until `read`
 * answers `expected` or `passes` have run; `beforePass` moves a clock on.
 * Answers what `read` answered last.
 */
const settleUntil = async <T>(
  run: Parameters<typeof createCashuAccountSync>[0],
  read: () => Promise<T>,
  expected: T,
  {
    beforePass = () => {},
    passes = 8,
  }: { readonly beforePass?: () => void; readonly passes?: number } = {}
): Promise<T> => {
  const sync = createCashuAccountSync(run)
  let last = await read()
  for (let pass = 0; pass < passes && !Object.is(last, expected); pass++) {
    beforePass()
    await sync.settle()
    last = await read()
  }
  return last
}

const claimsOf = async (
  deps: CashuBackgroundJobContext,
  paymentId: PaymentId
): Promise<number> =>
  (await deps.evolu.loadQuery(paymentClaimsQuery(paymentId))).length

describe("cashu account sync job", () => {
  test("settles a paid Cashu payment: claims the quote, books the topup, claims the payment", async () => {
    const { t, deps, errors, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)

    const [quoteId] = t.mint.mintQuoteIds()
    t.mint.payMintQuote(quoteId ?? "")

    expect(await settleUntil(run, () => claimsOf(deps, paymentId), 1)).toBe(1)
    expect(t.mint.mintQuoteState(quoteId ?? "")).toBe("ISSUED")
    expect(errors).toEqual([])
  })

  test("claims a topup the moment its mint pushes the quote paid (NUT-17), with no poll due", async () => {
    const { t, deps, errors, paymentId } = await setup({
      mint: { supportsNut17: true },
    })
    await using _ = t
    // A clock that stands still: after the first pass no poll is ever due
    // again, so only the mint's push can bring the claim.
    const frozen = new Date()
    await using run = testCreateRun({ ...deps, date: { now: () => frozen } })
    const job = await run.ok(startCashuAccountSyncJob)

    // The first pass has polled the unpaid quote and subscribed to it.
    await expect
      .poll(() => t.mint.mintQuoteSubscriptionCount(), { timeout: 10_000 })
      .toBe(1)
    const [quoteId] = t.mint.mintQuoteIds()
    t.mint.payMintQuote(quoteId ?? "")

    await waitForClaim(deps, paymentId)
    expect(t.mint.mintQuoteState(quoteId ?? "")).toBe("ISSUED")
    // Claimed, the topup is no longer watched, and the mint's socket closes.
    await expect
      .poll(() => t.mint.mintQuoteSubscriptionCount(), { timeout: 10_000 })
      .toBe(0)
    await expect.poll(() => t.mint.webSocketCount()).toBe(0)
    await job[Symbol.asyncDispose]()
    expect(errors).toEqual([])
  }, 30_000)

  test("a stopped job closes the sockets of the quotes it watched (NUT-17)", async () => {
    const { t, deps, errors } = await setup({ mint: { supportsNut17: true } })
    await using _ = t
    await using run = testCreateRun(deps)
    const job = await run.ok(startCashuAccountSyncJob)
    await expect
      .poll(() => t.mint.mintQuoteSubscriptionCount(), { timeout: 10_000 })
      .toBe(1)
    expect(t.mint.webSocketCount()).toBe(1)

    await job[Symbol.asyncDispose]()

    await expect.poll(() => t.mint.webSocketCount()).toBe(0)
    expect(t.mint.mintQuoteSubscriptionCount()).toBe(0)
    expect(errors).toEqual([])
  }, 30_000)

  test("a mint whose socket hangs delays no claim, and is not asked again at once (NUT-17)", async () => {
    const { t, deps, errors, paymentId } = await setup({
      mint: { supportsNut17: true },
    })
    await using _ = t
    t.mint.hangWebSockets()
    // A clock a tick ahead at every look, so each pass polls the topup.
    let offsetMs = 0
    await using run = testCreateRun({
      ...deps,
      date: {
        now: () => {
          offsetMs += 5_000
          return new Date(Date.now() + offsetMs)
        },
      },
    })
    const job = await run.ok(createCashuAccountSyncJob({ tickMs: 50 }))
    await expect.poll(() => t.mint.webSocketAttempts()).toBe(1)
    const [quoteId] = t.mint.mintQuoteIds()
    t.mint.payMintQuote(quoteId ?? "")

    // A poll claims it, on passes that did not wait for the socket that
    // hangs, and none of them asks for another one.
    await waitForClaim(deps, paymentId)
    await job[Symbol.asyncDispose]()
    expect(t.mint.webSocketAttempts()).toBe(1)
    expect(errors).toEqual([])
  }, 30_000)

  test("settles a payment paid with a NUT-18 token over NIP-17", async () => {
    const { t, deps, errors, relays, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const job = await run.ok(createCashuAccountSyncJob({ tickMs: 50 }))

    // The customer's wallet sends the payment's 8 600 sat as a payload.
    const customerWallet = await createCashuWalletDep({
      seed: CashuWalletSeed(new Uint8Array(64).fill(9)),
      fetch: t.deps.fetch,
    }).cashuWallet.load(testMintUrl)
    const quote = await customerWallet.createMintQuoteBolt11(8_600)
    t.mint.payMintQuote(quote.quote)
    const proofs = await customerWallet.mintProofsBolt11(8_600, quote.quote)
    const customer = generateSecretKey()
    const payky = getPublicKey(deriveNostrSecretKey(testCashuMasterKey))
    const payload = JSON.stringify({
      id: paymentId,
      mint: testMintUrl,
      unit: "sat",
      proofs: proofs.map((proof) => ({
        id: proof.id,
        amount: Number(proof.amount),
        secret: proof.secret,
        C: proof.C,
      })),
    })
    relays.deliver(
      createWrap(
        createSeal(
          createRumor(
            {
              kind: PrivateDirectMessage,
              created_at: Math.floor(Date.now() / 1000),
              content: payload,
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

    await waitForClaim(deps, paymentId)
    await job[Symbol.asyncDispose]()
    expect(errors).toEqual([])
  }, 30_000)

  test("closes a move's topup left unpaid past its expiry, however old it is", async () => {
    const { t, deps, errors } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const topup = await run.orThrow(
      createCashuTopupQuote({
        mint: testMintUrl,
        amount: CashuAmount(500),
        purpose: "move",
      })
    )
    // Two days on: the quote expired long ago and the mint still says UNPAID.
    const later = {
      ...deps,
      date: { now: () => new Date(Date.now() + 2 * 24 * 60 * 60_000) },
    }
    await using laterRun = testCreateRun(later)

    expect(
      await settleUntil(
        laterRun,
        async () =>
          (await loadTestCashuOperations(deps.evolu)).find(
            (operation) => operation.id === topup.operationId
          )?.status,
        "failed"
      )
    ).toBe("failed")
    expect(errors).toEqual([])
  })

  test("claims for its payment a token booked on a device the payment had not reached (cashu/0025)", async () => {
    const { t, deps, errors, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const token = await createTestCashuCustomer(t).token(8_600)
    const inspected = await inspectCashuToken(
      token.text,
      bytesToHex(deriveNostrSecretKey(testCashuMasterKey))
    )
    if (!inspected.ok) throw new Error(inspected.error.type)
    // Another device booked the token before the payment synced to it; this
    // device's payment holds its receive, and the booking syncs in after.
    await run.orThrow(receiveCashuToken(inspected.value))
    await run.ok(
      holdCashuReceive({
        paymentId,
        receiveOperationId: inspected.value.receiveOperationId,
      })
    )
    expect(
      await deps.evolu.loadQuery(paymentClaimsQuery(paymentId))
    ).toHaveLength(0)

    expect(await settleUntil(run, () => claimsOf(deps, paymentId), 1)).toBe(1)
    expect(errors).toEqual([])
  })

  test("settles a melt another device sent and left, once the mint paid it, never sending it again (cashu/0027)", async () => {
    const { t, deps, errors } = await setup()
    await using _ = t
    // Another device of the account withdraws; the mint pays, the answer is
    // lost, and that device is gone before it could ask again.
    const sender = await t.otherDevice()
    await fundTestCashuWallet({ ...t, deps: sender }, 1000)
    await using senderRun = testCreateRun(sender)
    const invoice = "lnbc500n1pjfakeinvoice"
    const cost = await senderRun.orThrow(
      quoteCashuMelt({ mint: testMintUrl, invoice })
    )
    t.mint.failNext("melt", { type: "lostResponse" })
    t.mint.failNext("checkMeltQuote", { type: "ok" })
    t.mint.failNext("checkMeltQuote", { type: "unreachable" })
    const sent = await senderRun(
      meltCashu({
        mint: testMintUrl,
        invoice,
        quoteId: cost.quoteId,
        maxTotal: cost.maxTotal,
        purpose: "withdrawal",
      })
    )
    if (sent.ok || sent.error.type !== "CashuMeltPending")
      throw new Error("not pending")
    const { operationId } = sent.error
    // Its rows sync in here: the pending melt, its blocks, its held inputs.
    const [melt] = await sender.evolu.loadQuery(cashuMeltQuery(operationId))
    const attempts = await sender.evolu.loadQuery(
      cashuOperationAttemptsQuery(operationId)
    )
    const held = await sender.evolu.loadQuery(
      heldCashuProofsOfOperationQuery(operationId)
    )
    if (melt === undefined) throw new Error("no melt")
    await runMutationWithCompletion((options) => {
      upsertCashuOperationRow(
        deps.evolu,
        {
          id: operationId,
          kind: "melt",
          status: "pending",
          mintUrl: melt.mintUrl,
          amount: melt.amount,
          keysetId: melt.keysetId,
        },
        options
      )
      deps.evolu.upsert(
        "cashuMelt",
        {
          id: operationId,
          quoteId: melt.quoteId,
          lnInvoice: CashuBolt11Schema.decode(invoice),
          feeReserve: melt.feeReserve,
          inputsTotal: melt.inputsTotal,
          purpose: "withdrawal",
          expiresAt: melt.expiresAt,
        },
        options
      )
      for (const attempt of attempts)
        upsertTestCashuAttemptElsewhere(
          deps.evolu,
          {
            operationId,
            keysetId: attempt.keysetId,
            counter: attempt.counter,
            role: attempt.role,
            slots: attempt.slots,
          },
          options
        )
      for (const proof of held)
        deps.evolu.upsert(
          "cashuProof",
          {
            id: proof.id,
            mintUrl: proof.mintUrl,
            keysetId: proof.keysetId,
            amount: proof.amount,
            secret: proof.secret,
            c: proof.c,
            dleq: null,
            operationId,
          },
          options
        )
    })
    // The clock moves on a grace at every look, so the takeover is due.
    let offsetMs = 0
    await using jobRun = testCreateRun({
      ...deps,
      date: { now: () => new Date(Date.now() + offsetMs) },
    })
    expect(
      await settleUntil(
        jobRun,
        async () =>
          (await loadTestCashuOperations(deps.evolu)).find(
            (operation) => operation.id === operationId
          )?.status,
        "paid",
        {
          beforePass: () => {
            offsetMs += CLAIMED_ELSEWHERE_GRACE_MS
          },
        }
      )
    ).toBe("paid")
    expect(t.mint.requestCount("melt")).toBe(1)
    // The account's balance less the 50 sent: the change came back, and this
    // device's first use of the keyset restored the rest.
    expect(await testCashuBalance(deps.evolu)).toBe(950)
    expect(errors).toEqual([])
  })

  test("a melt this device only fenced is still another device's: its refused fence never lets the inputs go (cashu/0027)", async () => {
    const t = await createCashuTest({ mint: { meltQuotesExpire: false } })
    await using _ = t
    const { deps, errors } = createJobDeps(t)
    await using setupRun = testCreateRun(deps)
    await setupRun.ok(saveCashuAccount({ enabled: true }))
    // Another device withdraws; its melt request is on its way when that
    // device goes quiet, and its blanks' block never syncs in.
    const sender = await t.otherDevice()
    await fundTestCashuWallet({ ...t, deps: sender }, 1000)
    await using senderRun = testCreateRun(sender)
    const invoice = "lnbc500n1pjfakeinvoice"
    const cost = await senderRun.orThrow(
      quoteCashuMelt({ mint: testMintUrl, invoice })
    )
    t.mint.failNext("melt", { type: "unreachable" })
    const sent = await senderRun(
      meltCashu({
        mint: testMintUrl,
        invoice,
        quoteId: cost.quoteId,
        maxTotal: cost.maxTotal,
        purpose: "withdrawal",
      })
    )
    if (sent.ok || sent.error.type !== "CashuMeltPending")
      throw new Error("not pending")
    const { operationId } = sent.error
    const [melt] = await sender.evolu.loadQuery(cashuMeltQuery(operationId))
    const attempts = await sender.evolu.loadQuery(
      cashuOperationAttemptsQuery(operationId)
    )
    const held = await sender.evolu.loadQuery(
      heldCashuProofsOfOperationQuery(operationId)
    )
    const blanks = attempts.find((attempt) => attempt.role === "meltChange")
    if (melt === undefined || blanks === undefined) throw new Error("no melt")
    await runMutationWithCompletion((options) => {
      upsertCashuOperationRow(
        deps.evolu,
        {
          id: operationId,
          kind: "melt",
          status: "pending",
          mintUrl: melt.mintUrl,
          amount: melt.amount,
          keysetId: melt.keysetId,
        },
        options
      )
      deps.evolu.upsert(
        "cashuMelt",
        {
          id: operationId,
          quoteId: melt.quoteId,
          lnInvoice: CashuBolt11Schema.decode(invoice),
          feeReserve: melt.feeReserve,
          inputsTotal: melt.inputsTotal,
          purpose: "withdrawal",
          expiresAt: melt.expiresAt,
        },
        options
      )
      for (const attempt of attempts)
        if (attempt.role !== "meltChange")
          upsertTestCashuAttemptElsewhere(
            deps.evolu,
            {
              operationId,
              keysetId: attempt.keysetId,
              counter: attempt.counter,
              role: attempt.role,
              slots: attempt.slots,
            },
            options
          )
      for (const proof of held)
        deps.evolu.upsert(
          "cashuProof",
          {
            id: proof.id,
            mintUrl: proof.mintUrl,
            keysetId: proof.keysetId,
            amount: proof.amount,
            secret: proof.secret,
            c: proof.c,
            dleq: null,
            operationId,
          },
          options
        )
    })
    // This device's first fence is refused; its block is its own from then.
    t.mint.failNext("swap", {
      type: "error",
      code: 11010,
      detail: "transaction is not balanced",
    })
    let offsetMs = 0
    await using jobRun = testCreateRun({
      ...deps,
      date: { now: () => new Date(Date.now() + offsetMs) },
    })
    expect(
      await settleUntil(
        jobRun,
        async () =>
          (await loadTestCashuOperations(deps.evolu)).find(
            (operation) => operation.id === operationId
          )?.status,
        "unpaid",
        {
          beforePass: () => {
            offsetMs += CLAIMED_ELSEWHERE_GRACE_MS
          },
        }
      )
    ).toBe("unpaid")

    // The sender's request reaches the mint now: its inputs were fenced.
    await expect(
      sender.cashuWallet
        .load(testMintUrl)
        .then(async (wallet) =>
          wallet.meltProofsBolt11(
            await wallet.checkMeltQuoteBolt11(melt.quoteId),
            toWalletProofs(held),
            { keysetId: blanks.keysetId },
            { type: "deterministic", counter: blanks.counter }
          )
        )
    ).rejects.toThrow()
    expect(t.mint.requestCount("swap")).toBeGreaterThanOrEqual(2)
    expect(errors).toEqual([])
  })

  test("reclaims and books its own claim at a topup another device closed as contested (cashu/0029)", async () => {
    const t = await createCashuTest()
    await using _ = t
    // Earlier work moves the closing device's counter past this one's: a
    // claim that never reached the mint leaves its slots reserved there and
    // unsigned, where this device's first claim starts.
    await fundTestCashuWallet(t, 1000)
    await using closerRun = testCreateRun(t.deps)
    const unsent = await closerRun.orThrow(
      createCashuTopupQuote({
        mint: testMintUrl,
        amount: CashuAmount(7),
        purpose: "payment",
      })
    )
    t.mint.payMintQuote(unsent.quoteId)
    t.mint.failNext("mint", { type: "unreachable" })
    expect((await closerRun(claimCashuTopup(unsent.operationId))).ok).toBe(
      false
    )
    const quote = await closerRun.orThrow(
      createCashuTopupQuote({
        mint: testMintUrl,
        amount: CashuAmount(100),
        purpose: "payment",
      })
    )
    t.mint.payMintQuote(quote.quoteId)
    // The closing device's claim never reaches the mint, and another
    // operation's reclaim contests its block.
    t.mint.failNext("mint", { type: "unreachable" })
    expect((await closerRun(claimCashuTopup(quote.operationId))).ok).toBe(false)
    const [mine] = await t.deps.evolu.loadQuery(
      cashuOperationAttemptsQuery(quote.operationId)
    )
    if (mine === undefined) throw new Error("no attempt")
    await runMutationWithCompletion((options) =>
      t.deps.evolu.update(
        "cashuOperationAttempt",
        { id: mine.id, isContested: sqliteTrue },
        options
      )
    )
    // This device claims at a block of its own; the mint signs, the answer
    // is lost, and its attempt never reaches the closing device.
    const device = await t.otherDevice()
    const { deps, errors } = createJobDeps({ ...t, deps: device })
    await using deviceRun = testCreateRun(deps)
    await deviceRun.ok(saveCashuAccount({ enabled: true }))
    await runMutationWithCompletion((options) =>
      upsertCashuTopupRows(deps.evolu, quote, "payment", options)
    )
    t.mint.failNext("mint", { type: "lostResponse" })
    expect((await deviceRun(claimCashuTopup(quote.operationId))).ok).toBe(false)
    // The closing device finds nothing of its own and closes it contested;
    // the close and the mark sync in here.
    const closed = await closerRun(claimCashuTopup(quote.operationId))
    expect(closed.ok && closed.value).toEqual({ type: "contested" })
    await runMutationWithCompletion((options) => {
      updateCashuOperation(
        deps.evolu,
        quote.operationId,
        { status: "done", settledAt: TimestampMs(Date.now()) },
        options
      )
      deps.evolu.upsert(
        "cashuOperationAttempt",
        {
          id: mine.id,
          operationId: quote.operationId,
          keysetId: mine.keysetId,
          counter: mine.counter,
          role: mine.role,
          slots: mine.slots,
          isContested: sqliteTrue,
        },
        options
      )
    })
    const before = await testCashuBalance(deps.evolu)

    expect(
      await settleUntil(
        deviceRun,
        () => testCashuBalance(deps.evolu),
        before + 100
      )
    ).toBe(before + 100)
    expect(
      await deps.evolu.loadQuery(
        accountTransactionExistsQuery(
          deriveCashuAccountTransactionId(quote.operationId)
        )
      )
    ).toHaveLength(1)
    expect(errors).toEqual([])
  })

  test("settles a topup's contest reached only by taking another device's claim over, past its grace (cashu/0029)", async () => {
    const { t, deps, errors } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    // Another device claimed a topup at slot 7000 and is gone before it
    // stored the proofs.
    const quote = await run.orThrow(
      createCashuTopupQuote({
        mint: testMintUrl,
        amount: CashuAmount(100),
        purpose: "move",
      })
    )
    t.mint.payMintQuote(quote.quoteId)
    const other = await t.otherDevice()
    const wallet = await other.cashuWallet.load(testMintUrl)
    await wallet.mintProofsBolt11(100, quote.quoteId, undefined, {
      type: "deterministic",
      counter: 7000,
    })
    // A receive of a token Linky spent shares that block: both could have
    // signed it.
    const token = await createTestCashuCustomer(t).token(8)
    await token.wallet.receive(token.text)
    const inspected = await inspectCashuToken(
      token.text,
      bytesToHex(deriveNostrSecretKey(testCashuMasterKey))
    )
    if (!inspected.ok) throw new Error(inspected.error.type)
    const receiveId = inspected.value.receiveOperationId
    await runMutationWithCompletion((options) => {
      upsertTestCashuAttemptElsewhere(
        deps.evolu,
        {
          operationId: quote.operationId,
          keysetId: t.mint.keysetId,
          counter: 7000,
          role: "mint",
        },
        options
      )
      upsertCashuOperationRow(
        deps.evolu,
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
      deps.evolu.upsert(
        "cashuReceive",
        { id: receiveId, tokenText: token.text, fee: NonNegativeInteger(0) },
        options
      )
      upsertTestCashuAttemptElsewhere(
        deps.evolu,
        {
          operationId: receiveId,
          keysetId: t.mint.keysetId,
          counter: 7000,
          role: "swap",
        },
        options
      )
    })
    // The clock moves on a grace at every look.
    let offsetMs = 0
    await using jobRun = testCreateRun({
      ...deps,
      date: { now: () => new Date(Date.now() + offsetMs) },
    })
    expect(
      await settleUntil(
        jobRun,
        async () => await testCashuBalance(deps.evolu),
        100,
        {
          beforePass: () => {
            offsetMs += CLAIMED_ELSEWHERE_GRACE_MS
          },
        }
      )
    ).toBe(100)
    const rejected = async (operationId: typeof receiveId) =>
      (
        await deps.evolu.loadQuery(cashuOperationAttemptsQuery(operationId))
      ).map((row) => row.isRejected)
    expect(await rejected(quote.operationId)).toEqual([1])
    expect(await rejected(receiveId)).toEqual([1])
    expect(errors).toEqual([])
  })

  test("settles a melt whose change block is contested, past its grace, with no receive left to do it (cashu/0029)", async () => {
    const { t, deps, errors } = await setup()
    await using _ = t
    // This device withdraws; the mint pays with change, and the answer is
    // lost.
    await fundTestCashuWallet({ ...t, deps }, 1000)
    await using run = testCreateRun(deps)
    const invoice = "lnbc500n1pjfakeinvoice"
    const cost = await run.orThrow(
      quoteCashuMelt({ mint: testMintUrl, invoice })
    )
    t.mint.failNext("melt", { type: "lostResponse" })
    t.mint.failNext("checkMeltQuote", { type: "ok" })
    t.mint.failNext("checkMeltQuote", { type: "unreachable" })
    const sent = await run(
      meltCashu({
        mint: testMintUrl,
        invoice,
        quoteId: cost.quoteId,
        maxTotal: cost.maxTotal,
        purpose: "withdrawal",
      })
    )
    if (sent.ok || sent.error.type !== "CashuMeltPending")
      throw new Error("not pending")
    const { operationId } = sent.error
    const blanks = (
      await deps.evolu.loadQuery(cashuOperationAttemptsQuery(operationId))
    ).find((attempt) => attempt.role === "meltChange")
    if (blanks === undefined) throw new Error("no blank outputs' block")
    // Another device's receive of a token Linky spent shares that block,
    // and its message is gone: no listener will settle the contest.
    const token = await createTestCashuCustomer(t).token(8)
    await token.wallet.receive(token.text)
    const inspected = await inspectCashuToken(
      token.text,
      bytesToHex(deriveNostrSecretKey(testCashuMasterKey))
    )
    if (!inspected.ok) throw new Error(inspected.error.type)
    const receiveId = inspected.value.receiveOperationId
    await runMutationWithCompletion((options) => {
      upsertCashuOperationRow(
        deps.evolu,
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
      deps.evolu.upsert(
        "cashuReceive",
        { id: receiveId, tokenText: token.text, fee: NonNegativeInteger(0) },
        options
      )
      upsertTestCashuAttemptElsewhere(
        deps.evolu,
        {
          operationId: receiveId,
          keysetId: t.mint.keysetId,
          counter: blanks.counter,
          role: "swap",
        },
        options
      )
    })
    const balanceBefore = await testCashuBalance(deps.evolu)
    // The clock moves on a grace at every look.
    let offsetMs = 0
    await using jobRun = testCreateRun({
      ...deps,
      date: { now: () => new Date(Date.now() + offsetMs) },
    })
    expect(
      await settleUntil(
        jobRun,
        async () =>
          (await loadTestCashuOperations(deps.evolu)).find(
            (operation) => operation.id === operationId
          )?.status,
        "paid",
        {
          beforePass: () => {
            offsetMs += CLAIMED_ELSEWHERE_GRACE_MS
          },
        }
      )
    ).toBe("paid")
    // The change came back to the wallet, booked to no one.
    expect(await testCashuBalance(deps.evolu)).toBeGreaterThan(balanceBefore)
    expect(errors).toEqual([])
  })

  test("seeds an account enabled before this device synced, once it has (cashu/0013)", async () => {
    await using t = await createCashuTest({ defaultMint: null })
    const { deps, errors } = createJobDeps(t)
    const sync = { complete: false }
    const unsynced = {
      ...deps,
      appOwnerSync: {
        state: () =>
          sync.complete
            ? { type: "complete" as const }
            : { type: "pending" as const },
      },
    }
    await using run = testCreateRun(unsynced)
    await run.ok(saveCashuAccount({ enabled: true }))
    const passes = createCashuAccountSync(run)
    const trusted = async () =>
      trustedCashuMintsOf(await deps.evolu.loadQuery(cashuTrustedMintsQuery))

    // A pass while unsynced: nothing is seeded.
    await passes.settle()
    expect(await trusted()).toEqual([])

    sync.complete = true
    await passes.settle()
    expect(await trusted()).toEqual([MAIN_MINT_URL])
    expect(errors).toEqual([])
  })

  describe("a pending melt costs the job's passes little", () => {
    test("a melt this device is sending holds up no pass: its resume skips the melt instead of waiting for its lock", async () => {
      await using t = await createCashuTest()
      const { deps, errors } = createJobDeps(t)
      await using run = testCreateRun(deps)
      await run.ok(saveCashuAccount({ enabled: true }))
      await fundTestCashuWallet(t, 1000)
      const sync = createCashuAccountSync(run)
      const during: Array<{
        readonly status: string | null | undefined
        readonly asked: number
      }> = []
      // A pass of the job while the melt request is in flight, its counter
      // lock held.
      t.mint.failNext("melt", {
        type: "then",
        run: async () => {
          const before = t.mint.requestCount("checkMeltQuote")
          await sync.settle()
          during.push({
            status: (await loadTestCashuOperations(deps.evolu)).find(
              (operation) => operation.kind === "melt"
            )?.status,
            asked: t.mint.requestCount("checkMeltQuote") - before,
          })
        },
      })
      const invoice = "lnbc500n1pjfakeinvoice"
      const cost = await run.orThrow(
        quoteCashuMelt({ mint: testMintUrl, invoice })
      )

      const paid = await run(
        meltCashu({
          mint: testMintUrl,
          invoice,
          quoteId: cost.quoteId,
          maxTotal: cost.maxTotal,
          purpose: "withdrawal",
        })
      )

      expect(paid.ok).toBe(true)
      expect(during).toEqual([{ status: "pending", asked: 0 }])
      expect(errors).toEqual([])
    }, 10_000)

    test("a melt pending for long is resumed less often, as a topup is polled", async () => {
      let offsetMs = 0
      await using t = await createCashuTest()
      const { deps, errors } = createJobDeps(t)
      await using run = testCreateRun({
        ...deps,
        date: { now: () => new Date(Date.now() + offsetMs) },
      })
      await run.ok(saveCashuAccount({ enabled: true }))
      await fundTestCashuWallet(t, 1000)
      // A melt whose request was lost, and a mint that does not answer for
      // its quote: every resume leaves it pending.
      t.mint.failNext("melt", { type: "unreachable" })
      t.mint.failNext("checkMeltQuote", { type: "ok" })
      for (let i = 0; i < 10; i++)
        t.mint.failNext("checkMeltQuote", { type: "unreachable" })
      const invoice = "lnbc500n1pjfakeinvoice"
      const cost = await run.orThrow(
        quoteCashuMelt({ mint: testMintUrl, invoice })
      )
      const sent = await run(
        meltCashu({
          mint: testMintUrl,
          invoice,
          quoteId: cost.quoteId,
          maxTotal: cost.maxTotal,
          purpose: "withdrawal",
        })
      )
      expect(!sent.ok && sent.error.type).toBe("CashuMeltPending")
      const sync = createCashuAccountSync(run)
      const asked = t.mint.requestCount("checkMeltQuote")
      const passAt = async (ms: number) => {
        offsetMs = ms
        await sync.settle()
        return t.mint.requestCount("checkMeltQuote") - asked
      }

      expect(await passAt(0)).toBe(1)
      expect(await passAt(1_000)).toBe(1)
      expect(await passAt(5_000)).toBe(2)
      // Ten minutes on, once a minute.
      expect(await passAt(600_000)).toBe(3)
      expect(await passAt(630_000)).toBe(3)
      expect(await passAt(660_000)).toBe(4)
      expect(errors).toEqual([])
    })
  })
})
