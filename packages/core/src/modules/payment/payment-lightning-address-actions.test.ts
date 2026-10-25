import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "../../evolu/schema.ts"
import { activeClaimedTransactionsByPaymentIdQuery } from "../reconciliation-claim/reconciliation-claim-queries.ts"
import { sumDistinctClaimedAmounts } from "../shared/claimed-amount.ts"
import {
  createTestInvoice,
  testPreimage,
  testPreimagePaymentHash,
} from "../shared/lightning-invoice-test-fixtures.ts"
import { NonEmptyStringSchema } from "../shared/schema.ts"
import { cancelPayment, payPaymentWithBoltCard } from "./payment-actions.ts"
import {
  invoice,
  invoiceTimestamp,
  prepareLightningAddressPayment,
  setupLightningAddressPayment,
  syncLightningAddressTestPayment,
  verifyUrl,
} from "./payment-lightning-address-test-fixtures.ts"
import { paymentIdsByLnInvoiceQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

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
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu

    expect(await prepareLightningAddressPayment(s)).toEqual({
      ok: true,
      value: s.paymentId,
    })
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
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    s.wallet.minSendable = 10_000_000

    expect(await prepareLightningAddressPayment(s)).toMatchObject({
      ok: false,
      error: {
        type: "LightningAddressAmountOutOfRange",
        amountSats: 8_600,
        minSendableSats: 10_000,
      },
    })
  })

  test("refuses an invoice without a LUD-21 verify URL", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    s.wallet.verify = false

    expect(await prepareLightningAddressPayment(s)).toEqual({
      ok: false,
      error: { type: "LightningAddressVerifyUnsupported" },
    })
    expect(
      await s.deps.evolu.loadQuery(paymentRowsQuery(s.paymentId))
    ).toMatchObject([{ lnInvoice: null }])
  })

  test("keeps a withdrawal from paying the invoice back out", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)

    expect(
      await s.deps.evolu.loadQuery(
        paymentIdsByLnInvoiceQuery(NonEmptyStringSchema.decode(invoice))
      )
    ).toEqual([{ id: s.paymentId }])
  })
})

describe("payPaymentWithBoltCard on the Lightning address tab", () => {
  test("hands the wallet's invoice to the card's service", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)
    const cardRequests: string[] = []
    const deps = {
      ...s.deps,
      fetch: async (input: RequestInfo | URL) => {
        const url = input instanceof URL ? input.toString() : String(input)
        if (!url.startsWith("https://card.example.test/")) {
          return s.deps.fetch(input)
        }
        cardRequests.push(url)
        return Response.json(
          url.includes("/callback")
            ? { status: "OK" }
            : {
                tag: "withdrawRequest",
                callback: "https://card.example.test/callback",
                k1: "k1",
                minWithdrawable: 1_000,
                maxWithdrawable: 100_000_000,
              }
        )
      },
    }
    await using run = testCreateRun(deps)

    expect(
      await run(
        payPaymentWithBoltCard({
          paymentId: s.paymentId,
          uri: "lnurlw://card.example.test/ln?p=AA&c=BB",
          method: "lightningAddress",
        })
      )
    ).toEqual({ ok: true, value: undefined })
    expect(cardRequests.at(-1)).toBe(
      `https://card.example.test/callback?k1=k1&pr=${invoice}`
    )
  })
})

describe("syncLightningAddressPayment", () => {
  test("settles the payment with the preimage that proves it", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)
    s.wallet.settled = true
    s.wallet.preimage = testPreimage

    expect(await syncLightningAddressTestPayment(s)).toEqual({
      ok: true,
      value: "paid",
    })
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
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)

    expect(await syncLightningAddressTestPayment(s)).toEqual({
      ok: true,
      value: "pending",
    })
  })

  test("writes nothing when the wallet says settled without a preimage", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)
    s.wallet.settled = true

    expect(await syncLightningAddressTestPayment(s)).toEqual({
      ok: true,
      value: "unverified",
    })
    expect(await s.deps.evolu.loadQuery(lightningTransactionsQuery)).toEqual([])
  })

  test("writes nothing for a preimage of another invoice", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)
    s.wallet.settled = true
    s.wallet.preimage = "44".repeat(32)

    expect(await syncLightningAddressTestPayment(s)).toEqual({
      ok: true,
      value: "unverified",
    })
    expect(await s.deps.evolu.loadQuery(lightningTransactionsQuery)).toEqual([])
  })

  test("refuses an answer about another invoice", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)
    s.wallet.settled = true
    s.wallet.preimage = testPreimage
    s.wallet.pr = createTestInvoice({ hrp: "lnbc86u" })

    expect(await syncLightningAddressTestPayment(s)).toEqual({
      ok: false,
      error: { type: "LightningAddressVerifyMismatch", id: s.paymentId },
    })
    expect(await s.deps.evolu.loadQuery(lightningTransactionsQuery)).toEqual([])
  })

  test("still books money that arrives after the payment was canceled", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)
    {
      await using run = testCreateRun(s.deps)
      await run.orThrow(cancelPayment(s.paymentId))
    }
    s.wallet.settled = true
    s.wallet.preimage = testPreimage

    expect(await syncLightningAddressTestPayment(s)).toEqual({
      ok: true,
      value: "paid",
    })
    const claims = await s.deps.evolu.loadQuery(
      activeClaimedTransactionsByPaymentIdQuery(s.paymentId)
    )
    expect(claims).toHaveLength(1)
  })

  test("two polls of a paid invoice write one transaction and one claim", async () => {
    const s = await setupLightningAddressPayment()
    await using _ = s.testEvolu
    await prepareLightningAddressPayment(s)
    s.wallet.settled = true
    s.wallet.preimage = testPreimage

    // Two devices that both saw the preimage before either write synced.
    const [first, second] = await Promise.all([
      syncLightningAddressTestPayment(s),
      syncLightningAddressTestPayment(s),
    ])
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
    expect(await syncLightningAddressTestPayment(s)).toEqual({
      ok: true,
      value: "paid",
    })
    expect(s.wallet.requests.filter((url) => url === verifyUrl)).toHaveLength(
      polls
    )
  })
})
