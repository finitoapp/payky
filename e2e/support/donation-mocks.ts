import type { Page } from "@playwright/test"

import { createTestInvoice } from "../../src/core/modules/shared/lightning-invoice-test-fixtures.ts"

const YADIO_EXRATES_URL = "https://api.yadio.io/exrates/**"
const LNURL_METADATA_URL = "https://payky.me/.well-known/lnurlp/donate"
const LNURL_CALLBACK_URL = "https://donate.e2e.test/callback"
const LNURL_VERIFY_URL = "https://donate.e2e.test/verify/1"
/**
 * A mainnet invoice for exactly `amountMsat`, as the app now checks the one a
 * Lightning address returns (withdraw/0005). One pico-bitcoin is 0.1 msat.
 */
const invoiceForMsat = (amountMsat: number): string =>
  createTestInvoice({
    hrp: `lnbc${amountMsat * 10}p`,
    timestamp: Math.floor(Date.now() / 1000),
    expirySeconds: 3600,
  })

export interface DonationMockOptions {
  /** Fiat-per-BTC rate the mocked Yadio response reports. */
  readonly exchangeRate?: number
  readonly minSendableSats?: number
  readonly maxSendableSats?: number
  /** The `pr` (bolt11) string the mocked LNURL callback returns; by default one for the requested amount. */
  readonly invoice?: string
  /** Whether the mocked verify endpoint reports the invoice as settled from the start. */
  readonly settled?: boolean
}

export interface DonationMocks {
  /** Flips the mocked LNURL verify endpoint's `settled` flag for the next poll. */
  setSettled: (settled: boolean) => void
}

/**
 * Intercepts every HTTP call the donation flow makes — Yadio's exchange
 * rate, the LNURL pay-request/callback/verify trio, and the donation
 * history endpoint — so `e2e/donation.spec.ts` doesn't depend on any real
 * external service. The LNURL callback/verify URLs point at a non-resolving
 * `donate.e2e.test` domain; Playwright's route interception happens before
 * DNS resolution, so that's fine as long as every URL it returns is also
 * routed here.
 */
export async function mockDonationApis(
  page: Page,
  options: DonationMockOptions = {}
): Promise<DonationMocks> {
  const exchangeRate = options.exchangeRate ?? 1_500_000
  const minSendableSats = options.minSendableSats ?? 1
  const maxSendableSats = options.maxSendableSats ?? 1_000_000
  let invoice = options.invoice ?? ""
  let settled = options.settled ?? false

  await page.route(YADIO_EXRATES_URL, async (route) => {
    await route.fulfill({
      json: { BTC: exchangeRate, timestamp: Date.now() },
    })
  })

  await page.route(LNURL_METADATA_URL, async (route) => {
    await route.fulfill({
      json: {
        tag: "payRequest",
        callback: LNURL_CALLBACK_URL,
        minSendable: minSendableSats * 1_000,
        maxSendable: maxSendableSats * 1_000,
        metadata: JSON.stringify([["text/plain", "Donate to Payky"]]),
      },
    })
  })

  await page.route(`${LNURL_CALLBACK_URL}**`, async (route) => {
    const amountMsat = Number(
      new URL(route.request().url()).searchParams.get("amount")
    )
    invoice = options.invoice ?? invoiceForMsat(amountMsat)
    await route.fulfill({
      json: { pr: invoice, routes: [], verify: LNURL_VERIFY_URL },
    })
  })

  await page.route(`${LNURL_VERIFY_URL}**`, async (route) => {
    await route.fulfill({
      json: {
        status: "OK",
        settled,
        preimage: settled ? "e2e-mock-preimage" : null,
        pr: invoice,
      },
    })
  })

  await page.route("**/api/donations**", async (route) => {
    await route.fulfill({ json: { items: [], nextCursor: null } })
  })

  return {
    setSettled: (value) => {
      settled = value
    },
  }
}
