import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "../../evolu/schema.ts"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import { createFakeSparkWallet } from "../../spark/spark-wallet-test-fixtures.ts"
import { createEvoluTest } from "../../testing/evolu.ts"
import { evoluTestDeps } from "../../testing/evolu-deps.ts"
import { saveLightningAddressAccount } from "../account/account-actions.ts"
import { activeClaimedTransactionsByPaymentIdQuery } from "../reconciliation-claim/reconciliation-claim-queries.ts"
import { sumDistinctClaimedAmounts } from "../shared/claimed-amount.ts"
import {
  createTestInvoice,
  testPreimage,
  testPreimagePaymentHash,
} from "../shared/lightning-invoice-test-fixtures.ts"
import {
  NonEmptyString255,
  NonEmptyStringSchema,
  NonNegativeInteger,
} from "../shared/schema.ts"
import { cancelPayment, createPayment } from "./payment-actions.ts"
import { syncLightningAddressPayment } from "./payment-lightning-address-actions.ts"
import { preparePaymentMethod } from "./payment-preparation-actions.ts"
import { paymentIdsByLnInvoiceQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

// Yadio: 1 BTC = 1 500 000 CZK, so 129 CZK is 8 600 sats = 86 µBTC.
const invoiceTimestamp = 1_780_000_000
const invoice = createTestInvoice({
  hrp: "lnbc86u",
  timestamp: invoiceTimestamp,
  expirySeconds: 600,
  paymentHash: testPreimagePaymentHash,
})
const verifyUrl = "https://wallet.test/lnurlp/shop/verify/1"

interface FakeWallet {
  minSendable: number
  verify: boolean
  settled: boolean
  preimage: string | null
  pr: string
  readonly requests: string[]
}

const setup = async () => {
  const testEvolu = await createEvoluTest()
  const wallet: FakeWallet = {
    minSendable: 1_000,
    verify: true,
    settled: false,
    preimage: null,
    pr: invoice,
    requests: [],
  }
  const deps = {
    ...evoluTestDeps(testEvolu.evolu),
    ...createYadioApiDep(),
    sparkWallet: { create: async () => createFakeSparkWallet({}) },
    date: { now: () => new Date((invoiceTimestamp + 60) * 1000) },
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof URL ? input : String(input))
      wallet.requests.push(url.toString())
      if (url.hostname === "api.yadio.io") {
        return Response.json({ BTC: 1_500_000, timestamp: 1_780_000_000_000 })
      }
      if (url.pathname === "/.well-known/lnurlp/shop") {
        return Response.json({
          tag: "payRequest",
          callback: "https://wallet.test/lnurlp/shop/callback",
          minSendable: wallet.minSendable,
          maxSendable: 100_000_000_000,
          metadata: '[["text/plain","Shop"]]',
          commentAllowed: 32,
        })
      }
      if (url.pathname === "/lnurlp/shop/callback") {
        return Response.json({
          pr: invoice,
          routes: [],
          ...(wallet.verify ? { verify: verifyUrl } : {}),
        })
      }
      if (url.toString() === verifyUrl) {
        return Response.json({
          status: "OK",
          settled: wallet.settled,
          preimage: wallet.preimage,
          pr: wallet.pr,
        })
      }
      return new Response("not found", { status: 404 })
    },
  }
  await using run = testCreateRun(deps)
  const accountId = await run.ok(
    saveLightningAddressAccount({
      enabled: true,
      address: NonEmptyString255("shop@wallet.test"),
    })
  )
  if (accountId === null) throw new Error("no Lightning address account")
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
  return { testEvolu, deps, wallet, accountId, paymentId }
}

type Setup = Awaited<ReturnType<typeof setup>>

const prepare = async ({ deps, accountId, paymentId }: Setup) => {
  await using run = testCreateRun(deps)
  return await run(
    preparePaymentMethod({ paymentId, lightningAddress: { accountId } })
  )
}

const sync = async ({ deps, paymentId }: Setup) => {
  await using run = testCreateRun(deps)
  return await run(syncLightningAddressPayment({ paymentId }))
}

const paymentRowsQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin(
        "paymentLightningAddress",
        "paymentLightningAddress.id",
        "payment.id"
      )
      .select([
        "payment.expiresAt",
        "paymentLightningAddress.accountId",
        "paymentLightningAddress.amountSats",
        "paymentLightningAddress.lnInvoice",
        "paymentLightningAddress.paymentHash",
        "paymentLightningAddress.verifyUrl",
        "paymentLightningAddress.invoiceExpiresAt",
        "paymentLightningAddress.preimage",
      ])
      .where("payment.id", "=", id)
  )

const lightningTransactionsQuery = createQuery((db) =>
  db
    .selectFrom("accountTransaction")
    .innerJoin(
      "accountTransactionLightning",
      "accountTransactionLightning.id",
      "accountTransaction.id"
    )
    .select([
      "accountTransaction.id",
      "accountTransaction.kind",
      "accountTransaction.amount",
      "accountTransaction.currency",
      "accountTransactionLightning.preImage",
      "accountTransactionLightning.paymentHash",
    ])
)

describe("preparePaymentMethod with a Lightning address", () => {
  test("asks the merchant's wallet for an invoice and expires with it", async () => {
    const s = await setup()
    await using _ = s.testEvolu

    expect(await prepare(s)).toEqual({ ok: true, value: s.paymentId })
    expect(await s.deps.evolu.loadQuery(paymentRowsQuery(s.paymentId))).toEqual(
      [
        {
          expiresAt: (invoiceTimestamp + 600) * 1000,
          accountId: s.accountId,
          amountSats: 8_600,
          lnInvoice: invoice,
          paymentHash: testPreimagePaymentHash,
          verifyUrl,
          invoiceExpiresAt: (invoiceTimestamp + 600) * 1000,
          preimage: null,
        },
      ]
    )
    const callback = s.wallet.requests.find((url) => url.includes("callback"))
    expect(callback).toBe(
      "https://wallet.test/lnurlp/shop/callback?amount=8600000&comment=Payky+%231"
    )
  })

  test("refuses an amount below what the wallet accepts", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    s.wallet.minSendable = 10_000_000

    expect(await prepare(s)).toMatchObject({
      ok: false,
      error: {
        type: "LightningAddressAmountOutOfRange",
        amountSats: 8_600,
        minSendableSats: 10_000,
      },
    })
  })

  test("refuses an invoice without a LUD-21 verify URL", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    s.wallet.verify = false

    expect(await prepare(s)).toEqual({
      ok: false,
      error: { type: "LightningAddressVerifyUnsupported" },
    })
    expect(
      await s.deps.evolu.loadQuery(paymentRowsQuery(s.paymentId))
    ).toMatchObject([{ lnInvoice: null }])
  })

  test("keeps a withdrawal from paying the invoice back out", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    await prepare(s)

    expect(
      await s.deps.evolu.loadQuery(
        paymentIdsByLnInvoiceQuery(NonEmptyStringSchema.decode(invoice))
      )
    ).toEqual([{ id: s.paymentId }])
  })
})

describe("syncLightningAddressPayment", () => {
  test("settles the payment with the preimage that proves it", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    await prepare(s)
    s.wallet.settled = true
    s.wallet.preimage = testPreimage

    expect(await sync(s)).toEqual({ ok: true, value: "paid" })
    expect(await s.deps.evolu.loadQuery(lightningTransactionsQuery)).toEqual([
      expect.objectContaining({
        kind: "lightningAddress",
        amount: 8_600,
        currency: "BTC",
        preImage: testPreimage,
        paymentHash: testPreimagePaymentHash,
      }),
    ])
    expect(
      await s.deps.evolu.loadQuery(paymentRowsQuery(s.paymentId))
    ).toMatchObject([{ preimage: testPreimage }])
    const claims = await s.deps.evolu.loadQuery(
      activeClaimedTransactionsByPaymentIdQuery(s.paymentId)
    )
    expect(sumDistinctClaimedAmounts(claims)).toBe(12_900)
  })

  test("waits while the wallet has not been paid", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    await prepare(s)

    expect(await sync(s)).toEqual({ ok: true, value: "pending" })
  })

  test("writes nothing when the wallet says settled without a preimage", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    await prepare(s)
    s.wallet.settled = true

    expect(await sync(s)).toEqual({ ok: true, value: "unverified" })
    expect(await s.deps.evolu.loadQuery(lightningTransactionsQuery)).toEqual([])
  })

  test("writes nothing for a preimage of another invoice", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    await prepare(s)
    s.wallet.settled = true
    s.wallet.preimage = "44".repeat(32)

    expect(await sync(s)).toEqual({ ok: true, value: "unverified" })
    expect(await s.deps.evolu.loadQuery(lightningTransactionsQuery)).toEqual([])
  })

  test("refuses an answer about another invoice", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    await prepare(s)
    s.wallet.settled = true
    s.wallet.preimage = testPreimage
    s.wallet.pr = createTestInvoice({ hrp: "lnbc86u" })

    expect(await sync(s)).toEqual({
      ok: false,
      error: { type: "LightningAddressVerifyMismatch", id: s.paymentId },
    })
    expect(await s.deps.evolu.loadQuery(lightningTransactionsQuery)).toEqual([])
  })

  test("still books money that arrives after the payment was canceled", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    await prepare(s)
    {
      await using run = testCreateRun(s.deps)
      await run.orThrow(cancelPayment(s.paymentId))
    }
    s.wallet.settled = true
    s.wallet.preimage = testPreimage

    expect(await sync(s)).toEqual({ ok: true, value: "paid" })
    const claims = await s.deps.evolu.loadQuery(
      activeClaimedTransactionsByPaymentIdQuery(s.paymentId)
    )
    expect(claims).toHaveLength(1)
  })

  test("two polls of a paid invoice write one transaction and one claim", async () => {
    const s = await setup()
    await using _ = s.testEvolu
    await prepare(s)
    s.wallet.settled = true
    s.wallet.preimage = testPreimage

    // Two devices that both saw the preimage before either write synced.
    const [first, second] = await Promise.all([sync(s), sync(s)])
    expect(first).toEqual({ ok: true, value: "paid" })
    expect(second).toEqual({ ok: true, value: "paid" })
    expect(
      await s.deps.evolu.loadQuery(lightningTransactionsQuery)
    ).toHaveLength(1)
    expect(
      await s.deps.evolu.loadQuery(
        activeClaimedTransactionsByPaymentIdQuery(s.paymentId)
      )
    ).toHaveLength(1)

    // Once settled, nobody asks the wallet again.
    const polls = s.wallet.requests.filter((url) => url === verifyUrl).length
    expect(await sync(s)).toEqual({ ok: true, value: "paid" })
    expect(s.wallet.requests.filter((url) => url === verifyUrl)).toHaveLength(
      polls
    )
  })
})
