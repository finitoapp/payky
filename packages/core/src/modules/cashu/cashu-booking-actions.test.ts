import {
  createIdFromString,
  createOwnerWebSocketTransport,
  createWebSocket,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createQuery } from "../../evolu/schema.ts"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import {
  createCashuTest,
  createTestCashuCustomer,
  fundTestCashuWallet,
  testCashuBalance,
  testMintUrl,
  watchTestQuery,
} from "../../testing/cashu.ts"
import { createTestRelay } from "../../testing/evolu-relay.ts"
import { saveCashuAccount } from "../account/account-actions.ts"
import { deriveCashuAccountTransactionId } from "../account-transaction/account-transaction-utils.ts"
import { createPayment, holdCashuReceive } from "../payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "../payment/payment-preparation-actions.ts"
import type { PaymentId } from "../payment/payment-types.ts"
import { activeClaimedTransactionsByPaymentIdQuery } from "../reconciliation-claim/reconciliation-claim-queries.ts"
import { sumDistinctClaimedAmounts } from "../shared/claimed-amount.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonNegativeInteger, TimestampMs } from "../shared/schema.ts"
import {
  loadCashuBooking,
  upsertCashuBooking,
} from "./cashu-booking-actions.ts"
import { upsertCashuOperationRow } from "./cashu-proof-actions.ts"
import {
  inspectCashuToken,
  receiveCashuToken,
} from "./cashu-receive-actions.ts"
import { claimCashuTopup } from "./cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuOperationId,
  CashuTokenText,
} from "./cashu-types.ts"

const setup = async ({ account = true }: { readonly account?: boolean } = {}) =>
  setupOn(await createCashuTest(), { account })

/** A Cashu account at the test mint, on a test the caller created. */
const setupOn = async (
  t: Awaited<ReturnType<typeof createCashuTest>>,
  { account = true }: { readonly account?: boolean } = {}
) => {
  const deps = {
    ...t.deps,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith(testMintUrl)
        ? t.deps.fetch(input, init)
        : new Response(
            JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
          ),
    ...createYadioApiDep(),
  }
  await using run = testCreateRun(deps)
  if (account) {
    await run.ok(saveCashuAccount({ enabled: true }))
  }
  return { t, deps }
}

type Setup = Awaited<ReturnType<typeof setup>>

const newPayment = async ({ deps }: Setup): Promise<PaymentId> => {
  await using run = testCreateRun(deps)
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
  const [account] = await deps.evolu.loadQuery(
    createQuery((db) =>
      db
        .selectFrom("accountCashu")
        .select(["id"])
        .where("isDeleted", "is not", 1)
    )
  )
  if (account === undefined) throw new Error("no Cashu account")
  await run.orThrow(
    prepareCashuPaymentMethod({ paymentId, accountId: account.id })
  )
  return paymentId
}

const paymentQuote = async ({ deps }: Setup, paymentId: PaymentId) => {
  const [row] = await deps.evolu.loadQuery(
    createQuery((db) =>
      db
        .selectFrom("paymentCashu")
        .select(["quoteId", "mintUrl"])
        .where("id", "=", paymentId)
    )
  )
  if (row?.quoteId === null || row?.quoteId === undefined)
    throw new Error("no quote")
  return row.quoteId
}

/** The customer pays the payment's invoice and the claim completes it. */
const payByLightning = async (s: Setup, paymentId: PaymentId) => {
  s.t.mint.payMintQuote(await paymentQuote(s, paymentId))
  const [topup] = await s.deps.evolu.loadQuery(createCashuQueryForTopups())
  if (topup === undefined) throw new Error("no topup")
  await using run = testCreateRun(s.deps)
  await run.orThrow(claimCashuTopup(topup.id))
  return topup.id
}

const createCashuQueryForTopups = () =>
  createQuery((db) =>
    db
      .selectFrom("cashuOperation")
      .select(["id"])
      .where("kind", "=", "topup")
      .where("status", "=", "pending")
  )

const transactionsQuery = createQuery((db) =>
  db
    .selectFrom("accountTransaction")
    .innerJoin(
      "accountTransactionCashu",
      "accountTransactionCashu.id",
      "accountTransaction.id"
    )
    .leftJoin(
      "reconciliationClaim",
      "reconciliationClaim.accountTransactionId",
      "accountTransaction.id"
    )
    .select([
      "accountTransaction.id",
      "accountTransaction.kind",
      "accountTransaction.amount",
      "accountTransaction.currency",
      "accountTransaction.updatedAt",
      "accountTransactionCashu.cashuOperationId",
      "reconciliationClaim.paymentId",
    ])
)

/** A pending receive of `amount` less `fee`, as `receiveCashuToken` writes it. */
const writePendingReceive = async (
  { deps }: Setup,
  {
    id,
    amount,
    fee = 0,
  }: {
    readonly id: CashuOperationId
    readonly amount: number
    readonly fee?: number
  }
) =>
  runMutationWithCompletion((options) => {
    upsertCashuOperationRow(
      deps.evolu,
      {
        id,
        kind: "receive",
        status: "pending",
        mintUrl: testMintUrl,
        amount: CashuAmount(amount),
        keysetId: null,
      },
      options
    )
    deps.evolu.upsert(
      "cashuReceive",
      {
        id,
        tokenText: CashuTokenText(`cashuB${id}`),
        fee: NonNegativeInteger(fee),
      },
      options
    )
  })

/** Incoming operations `done` with no transaction booked for them. */
const doneUnbookedQuery = createQuery((db) =>
  db
    .selectFrom("cashuOperation")
    .leftJoin("cashuTopup", "cashuTopup.id", "cashuOperation.id")
    .leftJoin(
      "accountTransactionCashu",
      "accountTransactionCashu.cashuOperationId",
      "cashuOperation.id"
    )
    .select(["cashuOperation.id"])
    .where("cashuOperation.status", "=", "done")
    .where("accountTransactionCashu.id", "is", null)
    .where((eb) =>
      eb.or([
        eb("cashuOperation.kind", "=", "receive"),
        eb("cashuTopup.purpose", "=", "payment"),
      ])
    )
)

describe("booking at completion (cashu/0014)", () => {
  test("a payment's topup is booked in the batch that completes it and claims the payment that holds its quote", async () => {
    const s = await setup()
    await using _ = s.t
    const paymentId = await newPayment(s)
    using watch = await watchTestQuery(s.deps.evolu, doneUnbookedQuery)

    const operationId = await payByLightning(s, paymentId)

    expect(watch.seen).toEqual([])
    expect(await s.deps.evolu.loadQuery(transactionsQuery)).toEqual([
      expect.objectContaining({
        kind: "cashu",
        amount: 8_600,
        currency: "BTC",
        cashuOperationId: operationId,
        paymentId,
      }),
    ])
    const claims = await s.deps.evolu.loadQuery(
      activeClaimedTransactionsByPaymentIdQuery(paymentId)
    )
    expect(sumDistinctClaimedAmounts(claims)).toBe(12_900)
  })

  test("a received token is booked at its face value less the fee in the batch that completes it, and claims the payment holding its receive", async () => {
    const s = await setup()
    await using _ = s.t
    const paymentId = await newPayment(s)
    const token = await createTestCashuCustomer(s.t).token(21)
    const inspected = await inspectCashuToken(
      token.text,
      "0000000000000000000000000000000000000000000000000000000000000001"
    )
    if (!inspected.ok) throw new Error(inspected.error.type)
    await using run = testCreateRun(s.deps)
    await run.ok(
      holdCashuReceive({
        paymentId,
        receiveOperationId: inspected.value.receiveOperationId,
      })
    )
    using watch = await watchTestQuery(s.deps.evolu, doneUnbookedQuery)

    await run.orThrow(receiveCashuToken(inspected.value))

    expect(watch.seen).toEqual([])
    const [transaction] = await s.deps.evolu.loadQuery(transactionsQuery)
    expect(transaction).toMatchObject({
      amount: 21,
      cashuOperationId: inspected.value.receiveOperationId,
      paymentId,
    })
  })

  test("a token's fee comes off its face value", async () => {
    const s = await setup()
    await using _ = s.t
    const id = createIdFromString<"CashuOperation">("fee-receive-op-000001")
    await writePendingReceive(s, { id, amount: 21, fee: 3 })
    await using run = testCreateRun(s.deps)

    const booking = await run.ok(loadCashuBooking(id, TimestampMs(1_000)))

    expect(booking?.transaction.input).toMatchObject({ amount: 18 })
    expect(booking?.claim).toBeNull()
  })

  test("a booking another device wrote is not written again, its id derived from the operation's", async () => {
    const s = await setup()
    await using _ = s.t
    const id = createIdFromString<"CashuOperation">("shared-receive-op-001")
    await writePendingReceive(s, { id, amount: 21 })
    await using run = testCreateRun(s.deps)
    const booking = await run.ok(loadCashuBooking(id, TimestampMs(1_000)))
    if (booking === null) throw new Error("no booking")
    await runMutationWithCompletion((options) =>
      upsertCashuBooking(s.deps.evolu, booking, options)
    )

    expect(booking.transaction.id).toBe(deriveCashuAccountTransactionId(id))
    expect(await run.ok(loadCashuBooking(id, TimestampMs(2_000)))).toBeNull()
  })

  test("a move's topup is not income", async () => {
    const s = await setup()
    await using _ = s.t
    using watch = await watchTestQuery(s.deps.evolu, doneUnbookedQuery)

    await fundTestCashuWallet(s.t, 100)

    expect(watch.seen).toEqual([])
    expect(await s.deps.evolu.loadQuery(transactionsQuery)).toEqual([])
  })

  test("without a Cashu account nothing is booked", async () => {
    const s = await setup({ account: false })
    await using _ = s.t
    const id = createIdFromString<"CashuOperation">("waiting-receive-op-01")
    await writePendingReceive(s, { id, amount: 21 })
    await using run = testCreateRun(s.deps)

    expect(await run.ok(loadCashuBooking(id, TimestampMs(1_000)))).toBeNull()
  })

  test("a topup claimed on one device syncs to another with its booking, which books nothing again", async () => {
    await using relay = await createTestRelay()
    const t = await createCashuTest({ createWebSocket })
    await using _ = t
    const s = await setupOn(t)
    const other = await t.otherDevice()
    for (const evolu of [s.deps.evolu, other.evolu])
      evolu.useOwner(evolu.appOwner, [
        createOwnerWebSocketTransport({
          url: relay.url,
          ownerId: evolu.appOwner.id,
        }),
      ])
    const paymentId = await newPayment(s)

    const operationId = await payByLightning(s, paymentId)

    // The other device sees the money and its booking over the relay.
    await expect
      .poll(() => testCashuBalance(other.evolu), {
        timeout: 15_000,
        interval: 200,
      })
      .toBe(8_600)
    expect(await other.evolu.loadQuery(transactionsQuery)).toHaveLength(1)
    await using otherRun = testCreateRun({ ...s.deps, ...other })
    expect(await otherRun.orThrow(claimCashuTopup(operationId))).toEqual({
      type: "done",
    })
    expect(await other.evolu.loadQuery(transactionsQuery)).toHaveLength(1)
  }, 30_000)
})
