import { sqliteFalse, sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { z } from "zod"

import { createQuery, type Evolu } from "../../evolu/schema.ts"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import { createFakeSparkWallet } from "../../spark/spark-wallet-test-fixtures.ts"
import {
  createCashuTest,
  createTestCashuCustomer,
  loadTestCashuOperations,
  testMintUrl,
  upsertTestCashuAttemptElsewhere,
} from "../../testing/cashu.ts"
import { saveCashuAccount } from "../account/account-actions.ts"
import { createCashuAccountId } from "../account/account-utils.ts"
import {
  setDefaultCashuMint,
  trustCashuMint,
} from "../cashu/cashu-mint-actions.ts"
import { cashuTrustedMintsQuery } from "../cashu/cashu-queries.ts"
import {
  inspectCashuToken,
  receiveCashuToken,
} from "../cashu/cashu-receive-actions.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "../cashu/cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuOperationAttemptId,
  type CashuQuoteId,
  MintUrl,
} from "../cashu/cashu-types.ts"
import {
  CashuTrustedMintsJson,
  cashuMintTrustId,
  cashuTopupOperationIdFor,
  MAIN_MINT_URL,
} from "../cashu/cashu-utils.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonEmptyString255, NonNegativeInteger } from "../shared/schema.ts"
import { createPayment, holdCashuReceive } from "./payment-actions.ts"
import {
  prepareCashuPaymentMethod,
  preparePaymentMethod,
} from "./payment-preparation-actions.ts"
import {
  paymentCashuContestedTopupsQuery,
  paymentClaimsQuery,
} from "./payment-queries.ts"
import { createPaymentAccounts } from "./payment-test-fixtures.ts"
import type { PaymentId } from "./payment-types.ts"

const otherMint = MintUrl("https://other.mint.test")

const setup = async ({
  seeded = true,
}: {
  /** False: an account enabled before the seed, with no mint chosen. */
  readonly seeded?: boolean
} = {}) => {
  const t = await createCashuTest({
    extraMints: [{ url: otherMint }, { url: MAIN_MINT_URL }],
    ...(seeded ? {} : { defaultMint: null }),
  })
  const deps = {
    ...t.deps,
    // Yadio: 1 BTC = 1 500 000 CZK, so 129 CZK is 8 600 sats.
    fetch: async () =>
      new Response(
        JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
      ),
    ...createYadioApiDep(),
    sparkWallet: {
      create: async () =>
        createFakeSparkWallet({
          createLightningInvoice: async () => ({
            id: "lightning-request-1",
            invoice: {
              encodedInvoice: "lnbc8600n1spark",
              paymentHash: "payment-hash-1",
            },
            paymentPreimage: "payment-preimage-1",
            sparkInvoice: "spark-invoice-1",
          }),
        }),
    },
  }
  await using run = testCreateRun(deps)
  const cashuAccountId = seeded
    ? await run.ok(saveCashuAccount({ enabled: true }))
    : await writeUnseededCashuAccount(deps.evolu)
  if (cashuAccountId === null) throw new Error("no Cashu account")
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
  return { t, deps, cashuAccountId, paymentId }
}

/** The Cashu account alone, as a device holds it before its mints sync in. */
const writeUnseededCashuAccount = async (evolu: Evolu) => {
  const id = createCashuAccountId()
  await runMutationWithCompletion((options) => {
    evolu.upsert("accountCashu", { id }, options)
    evolu.upsert(
      "account",
      {
        id,
        deviceId: null,
        name: NonEmptyString255("Cashu"),
        kind: "cashu",
        isDeleted: sqliteFalse,
      },
      options
    )
  })
  return id
}

const paymentRowsQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("paymentCashu", "paymentCashu.id", "payment.id")
      .leftJoin("paymentBtc", "paymentBtc.id", "payment.id")
      .select([
        "payment.expiresAt",
        "paymentCashu.amountSats as cashuSats",
        "paymentCashu.mintUrl",
        "paymentCashu.quoteId",
        "paymentCashu.lnInvoice",
        "paymentCashu.quoteExpiresAt",
        "paymentBtc.amountSats as sparkSats",
        "paymentBtc.accountId as sparkAccountId",
      ])
      .where("payment.id", "=", id)
  )

const quoteHoldsQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("paymentCashuQuoteHold")
      .select(["mintUrl", "quoteId"])
      .where("paymentId", "=", id)
  )

describe("prepareCashuPaymentMethod", () => {
  test("quotes the payment mint, writes the topup, the paymentCashu row and the payment's expiry", async () => {
    const { t, deps, cashuAccountId, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)

    const result = await run(
      prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
    )

    expect(result.ok).toBe(true)
    const [row] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
    expect(row).toMatchObject({ cashuSats: 8_600, mintUrl: testMintUrl })
    expect(await deps.evolu.loadQuery(quoteHoldsQuery(paymentId))).toEqual([
      { mintUrl: testMintUrl, quoteId: row?.quoteId },
    ])
    expect(row?.lnInvoice?.startsWith("lnbc86000n")).toBe(true)
    expect(row?.expiresAt).toBe(row?.quoteExpiresAt)
    const [operation] = await loadTestCashuOperations(deps.evolu)
    expect(operation).toMatchObject({
      kind: "topup",
      status: "pending",
      mintUrl: testMintUrl,
      amount: 8_600,
    })
  })

  test("quotes at the default mint", async () => {
    const { t, deps, cashuAccountId, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    await run.orThrow(trustCashuMint(otherMint))
    await run.orThrow(setDefaultCashuMint(otherMint))

    await run(
      prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
    )

    const [row] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
    expect(row?.mintUrl).toBe(otherMint)
  })

  test("quotes at the default and writes nothing to the trusted mints (cashu/0013)", async () => {
    const { t, deps, cashuAccountId, paymentId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const before = await deps.evolu.loadQuery(cashuTrustedMintsQuery)

    await run.orThrow(
      prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
    )

    const [row] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
    expect(row?.mintUrl).toBe(testMintUrl)
    expect(await deps.evolu.loadQuery(cashuTrustedMintsQuery)).toEqual(before)
  })

  describe("a device that knows no trusted mint (cashu/0018)", () => {
    test("quotes nothing before the account's mints sync in", async () => {
      const { t, deps, cashuAccountId, paymentId } = await setup({
        seeded: false,
      })
      await using _ = t
      await using run = testCreateRun(deps)

      const result = await run(
        prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
      )

      expect(!result.ok && result.error.type).toBe("CashuMintsNotSynced")
      const [row] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
      expect(row?.quoteId).toBeNull()
      expect(await deps.evolu.loadQuery(cashuTrustedMintsQuery)).toEqual([])
    })

    test("quotes at the merchant's list once it syncs in, not at the seed this device wrote before it (cashu/0013)", async () => {
      const { t, deps, cashuAccountId, paymentId } = await setup({
        seeded: false,
      })
      await using _ = t
      await using run = testCreateRun(deps)
      // Enabled here before the mints synced in: the seed trusts MAIN.
      await run.ok(saveCashuAccount({ enabled: true }))
      // The merchant's list, without MAIN, arrives later.
      await runMutationWithCompletion((options) =>
        deps.evolu.upsert(
          "cashuMintTrust",
          {
            id: cashuMintTrustId,
            trustedMintsJson: z.encode(CashuTrustedMintsJson, [otherMint]),
          },
          options
        )
      )

      await run.orThrow(
        prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
      )

      const [row] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
      expect(row?.mintUrl).toBe(otherMint)
    })
  })

  test("leaves Spark's rows alone when both are prepared", async () => {
    const { t, deps, cashuAccountId, paymentId } = await setup()
    await using _ = t
    const { sparkAccountId } = await createPaymentAccounts(deps)
    await using run = testCreateRun(deps)
    await run.orThrow(
      preparePaymentMethod({ paymentId, spark: { accountId: sparkAccountId } })
    )
    const [before] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))

    await run.orThrow(
      prepareCashuPaymentMethod({ paymentId, accountId: cashuAccountId })
    )

    const [after] = await deps.evolu.loadQuery(paymentRowsQuery(paymentId))
    expect(after?.sparkSats).toBe(before?.sparkSats)
    expect(after?.sparkAccountId).toBe(sparkAccountId)
    expect(after?.cashuSats).toBe(8_600)
  })

  test("refuses a payment of nothing", async () => {
    const { t, deps, cashuAccountId } = await setup()
    await using _ = t
    await using run = testCreateRun(deps)
    const zero = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(0),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )
    const result = await run(
      prepareCashuPaymentMethod({ paymentId: zero, accountId: cashuAccountId })
    )
    expect(!result.ok && result.error.type).toBe("ZeroAmountNotPayable")
  })
})

describe("a payment is paid by every hold it was given (cashu/0036)", () => {
  const prepare = async (
    s: Awaited<ReturnType<typeof setup>>
  ): Promise<CashuQuoteId> => {
    await using run = testCreateRun(s.deps)
    await run.orThrow(
      prepareCashuPaymentMethod({
        paymentId: s.paymentId,
        accountId: s.cashuAccountId,
      })
    )
    const [row] = await s.deps.evolu.loadQuery(paymentRowsQuery(s.paymentId))
    if (row?.quoteId === null || row?.quoteId === undefined)
      throw new Error("no quote")
    return row.quoteId
  }

  const claimsOf = async (s: Awaited<ReturnType<typeof setup>>) =>
    s.deps.evolu.loadQuery(paymentClaimsQuery(s.paymentId))

  /** A token for the payment, held by it as the listener holds one. */
  const heldToken = async (
    s: Awaited<ReturnType<typeof setup>>,
    customer: ReturnType<typeof createTestCashuCustomer>
  ) => {
    const token = await customer.token(8_600)
    const inspected = await inspectCashuToken(
      token.text,
      "0000000000000000000000000000000000000000000000000000000000000001"
    )
    if (!inspected.ok) throw new Error(inspected.error.type)
    await using run = testCreateRun(s.deps)
    await run.ok(
      holdCashuReceive({
        paymentId: s.paymentId,
        receiveOperationId: inspected.value.receiveOperationId,
      })
    )
    return inspected.value
  }

  test("money for a quote that another preparation replaced is claimed for the payment", async () => {
    const s = await setup()
    await using _ = s.t
    // The quote the customer was shown, then a new quote: staff asked for
    // one after expiry, or another device prepared Cashu before it synced.
    const shown = await prepare(s)
    const replacing = await prepare(s)
    expect(replacing).not.toBe(shown)

    s.t.mint.payMintQuote(shown)
    await using run = testCreateRun(s.deps)
    const claimed = await run(
      claimCashuTopup(cashuTopupOperationIdFor(testMintUrl, shown))
    )

    expect(claimed.ok && claimed.value).toEqual({
      type: "claimed",
      amount: 8_600,
    })
    expect(await claimsOf(s)).toHaveLength(1)
  })

  test("a token held before a new quote still pays the payment", async () => {
    const s = await setup()
    await using _ = s.t
    await prepare(s)
    const inspected = await heldToken(s, createTestCashuCustomer(s.t))
    await prepare(s)

    await using run = testCreateRun(s.deps)
    await run.orThrow(receiveCashuToken(inspected))

    expect(await claimsOf(s)).toHaveLength(1)
  })

  test("a quote id is unique only within its mint: money for the same id at another mint is not claimed for the payment", async () => {
    const s = await setup()
    await using _ = s.t
    const held = await prepare(s)
    await using run = testCreateRun(s.deps)
    // Another mint numbers its quotes as this one does.
    const elsewhere = await run.orThrow(
      createCashuTopupQuote({
        mint: otherMint,
        amount: CashuAmount(8_600),
        purpose: "payment",
      })
    )
    expect(elsewhere.quoteId).toBe(held)

    for (const fake of s.t.others) fake.payInvoice(elsewhere.invoice)
    const claimed = await run(claimCashuTopup(elsewhere.operationId))

    expect(claimed.ok && claimed.value.type).toBe("claimed")
    expect(await claimsOf(s)).toEqual([])
  })

  test("a second token never takes the first one's hold away", async () => {
    const s = await setup()
    await using _ = s.t
    await prepare(s)
    const customer = createTestCashuCustomer(s.t)
    const first = await heldToken(s, customer)
    await heldToken(s, customer)

    await using run = testCreateRun(s.deps)
    await run.orThrow(receiveCashuToken(first))

    expect(await claimsOf(s)).toHaveLength(1)
  })
})

describe("a Lightning payment a contest gave to no one is shown on its payment (cashu/0029)", () => {
  test("a quote the payment holds whose topup carries the contest's mark is found; one without it is not", async () => {
    const s = await setup()
    await using _ = s.t
    await using run = testCreateRun(s.deps)
    await run.orThrow(
      prepareCashuPaymentMethod({
        paymentId: s.paymentId,
        accountId: s.cashuAccountId,
      })
    )
    const [row] = await s.deps.evolu.loadQuery(paymentRowsQuery(s.paymentId))
    if (row?.quoteId === null || row?.quoteId === undefined)
      throw new Error("no quote")
    const operationId = cashuTopupOperationIdFor(testMintUrl, row.quoteId)
    const attempts: Array<CashuOperationAttemptId> = []
    await runMutationWithCompletion((options) => {
      attempts.push(
        upsertTestCashuAttemptElsewhere(
          s.deps.evolu,
          {
            operationId,
            keysetId: s.t.mint.keysetId,
            counter: 1,
            role: "mint",
          },
          options
        )
      )
    })
    const contested = () =>
      s.deps.evolu.loadQuery(paymentCashuContestedTopupsQuery(s.paymentId))
    expect(await contested()).toEqual([])

    await runMutationWithCompletion((options) => {
      for (const id of attempts)
        s.deps.evolu.update(
          "cashuOperationAttempt",
          { id, isContested: sqliteTrue },
          options
        )
    })

    expect(await contested()).toEqual([
      { operationId, amount: expect.any(Number), mintUrl: testMintUrl },
    ])
  })

  test("a contested topup at another mint with the payment's quote id is not the payment's", async () => {
    const s = await setup()
    await using _ = s.t
    await using run = testCreateRun(s.deps)
    await run.orThrow(
      prepareCashuPaymentMethod({
        paymentId: s.paymentId,
        accountId: s.cashuAccountId,
      })
    )
    const [row] = await s.deps.evolu.loadQuery(paymentRowsQuery(s.paymentId))
    // Another mint numbers its quotes as this one does.
    const elsewhere = await run.orThrow(
      createCashuTopupQuote({
        mint: otherMint,
        amount: CashuAmount(8_600),
        purpose: "payment",
      })
    )
    expect(elsewhere.quoteId).toBe(row?.quoteId)
    await runMutationWithCompletion((options) => {
      const id = upsertTestCashuAttemptElsewhere(
        s.deps.evolu,
        {
          operationId: elsewhere.operationId,
          keysetId: s.t.mint.keysetId,
          counter: 1,
          role: "mint",
        },
        options
      )
      s.deps.evolu.update(
        "cashuOperationAttempt",
        { id, isContested: sqliteTrue },
        options
      )
    })

    expect(
      await s.deps.evolu.loadQuery(
        paymentCashuContestedTopupsQuery(s.paymentId)
      )
    ).toEqual([])
  })
})
