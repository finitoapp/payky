import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { verifyLightningPreimage } from "../../modules/shared/lightning-invoice-utils.ts"
import { createFakeLightningAddressWallet } from "./fake-lightning-address-wallet.ts"
import {
  fetchLnurlPayInvoice,
  fetchLnurlVerify,
  probeLightningAddress,
} from "./lnurl-pay-client.ts"

const setup = () => {
  const now = Date.UTC(2026, 9, 25, 12)
  const wallet = createFakeLightningAddressWallet({
    address: "cafe@wallet.example",
    now: () => now,
  })
  const deps = {
    fetch: async (input: RequestInfo | URL) =>
      (await wallet.fetch(input)) ?? new Response("offline", { status: 503 }),
    date: { now: () => new Date(now) },
  }
  return { wallet, deps }
}

describe("createFakeLightningAddressWallet", () => {
  test("issues an invoice whose preimage it reveals once paid", async () => {
    const { wallet, deps } = setup()
    await using run = testCreateRun(deps)
    const metadata = await run.orThrow(
      probeLightningAddress({ address: "cafe@wallet.example" })
    )
    const invoice = await run.orThrow(
      fetchLnurlPayInvoice({ amountSats: 8_600, metadata })
    )
    const verifyUrl = invoice.verify ?? ""

    await expect(run(fetchLnurlVerify({ verifyUrl }))).resolves.toMatchObject({
      ok: true,
      value: { settled: false, preimage: null },
    })

    expect(wallet.pay(invoice.pr)).toBe(true)
    const verified = await run.orThrow(fetchLnurlVerify({ verifyUrl }))
    expect(verified.settled).toBe(true)
    expect(
      verifyLightningPreimage({
        preimage: verified.preimage ?? "",
        paymentHash: invoice.invoice.paymentHash ?? "",
      })
    ).toBe(true)
  })

  test("can stand for a wallet without verify or without the preimage", async () => {
    const { wallet, deps } = setup()
    await using run = testCreateRun(deps)
    wallet.options.verify = false
    await expect(
      run(probeLightningAddress({ address: "cafe@wallet.example" }))
    ).resolves.toEqual({
      ok: false,
      error: { type: "LightningAddressVerifyUnsupported" },
    })

    wallet.options.verify = true
    wallet.options.revealsPreimage = false
    const metadata = await run.orThrow(
      probeLightningAddress({ address: "cafe@wallet.example" })
    )
    const invoice = await run.orThrow(
      fetchLnurlPayInvoice({ amountSats: 100, metadata })
    )
    wallet.pay(invoice.pr)
    await expect(
      run(fetchLnurlVerify({ verifyUrl: invoice.verify ?? "" }))
    ).resolves.toMatchObject({
      ok: true,
      value: { settled: true, preimage: null },
    })
  })
})
