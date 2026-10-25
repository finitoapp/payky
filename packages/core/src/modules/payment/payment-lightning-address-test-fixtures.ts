import { testCreateRun } from "@evolu/common"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import { createFakeSparkWallet } from "../../spark/spark-wallet-test-fixtures.ts"
import { createEvoluTest } from "../../testing/evolu.ts"
import { evoluTestDeps } from "../../testing/evolu-deps.ts"
import { saveLightningAddressAccount } from "../account/account-actions.ts"
import {
  createTestInvoice,
  testPreimagePaymentHash,
} from "../shared/lightning-invoice-test-fixtures.ts"
import { NonEmptyString255, NonNegativeInteger } from "../shared/schema.ts"
import { createPayment } from "./payment-actions.ts"
import { syncLightningAddressPayment } from "./payment-lightning-address-actions.ts"
import { preparePaymentMethod } from "./payment-preparation-actions.ts"

/**
 * A 129 CZK payment and a fake wallet behind `shop@wallet.test` that serves
 * LNURL metadata, an invoice paid with `testPreimage`, and LUD-21 verify
 * answers the test sets on `wallet`.
 */
// Yadio: 1 BTC = 1 500 000 CZK, so 129 CZK is 8 600 sats = 86 µBTC.
export const invoiceTimestamp = 1_780_000_000
export const invoice = createTestInvoice({
  hrp: "lnbc86u",
  timestamp: invoiceTimestamp,
  expirySeconds: 600,
  paymentHash: testPreimagePaymentHash,
})
export const verifyUrl = "https://wallet.test/lnurlp/shop/verify/1"

interface FakeWallet {
  minSendable: number
  verify: boolean
  settled: boolean
  preimage: string | null
  pr: string
  readonly requests: string[]
}

export const setupLightningAddressPayment = async ({
  now = new Date((invoiceTimestamp + 60) * 1000),
}: {
  readonly now?: Date
} = {}) => {
  const clock = { now }
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
    date: { now: () => clock.now },
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
  return { testEvolu, deps, wallet, clock, accountId, paymentId }
}

export type LightningAddressPaymentSetup = Awaited<
  ReturnType<typeof setupLightningAddressPayment>
>

export const prepareLightningAddressPayment = async ({
  deps,
  accountId,
  paymentId,
}: LightningAddressPaymentSetup) => {
  await using run = testCreateRun(deps)
  return await run(
    preparePaymentMethod({ paymentId, lightningAddress: { accountId } })
  )
}

export const syncLightningAddressTestPayment = async ({
  deps,
  paymentId,
}: LightningAddressPaymentSetup) => {
  await using run = testCreateRun(deps)
  return await run(syncLightningAddressPayment({ paymentId }))
}
