import {
  createFakeLightningAddressWallet,
  type FakeLightningAddressWallet,
} from "@payky/core/integrations/lnurl/fake-lightning-address-wallet"
import type { Page } from "@playwright/test"

const YADIO_EXRATES_URL = "https://api.yadio.io/exrates/**"

/** The merchant's address the specs enter; `e2e.test` never resolves. */
export const e2eLightningAddress = "shop@wallet.e2e.test"

/**
 * Routes the merchant's wallet behind `e2eLightningAddress` to an in-test
 * fake (`createFakeLightningAddressWallet`) that answers LUD-16 metadata,
 * the LUD-06 callback and LUD-21 verify, plus Yadio's rate, so a spec drives
 * the whole flow offline. The returned wallet pays the invoice issued last (`payLatest`)
 * and stands for wallets without verify or without the preimage
 * (`options`). Playwright routes before DNS, so the unresolvable domain is
 * fine.
 */
export async function mockLightningAddressWallet(
  page: Page,
  { exchangeRate = 1_500_000 }: { readonly exchangeRate?: number } = {}
): Promise<FakeLightningAddressWallet> {
  const wallet = createFakeLightningAddressWallet({
    address: e2eLightningAddress,
    now: () => Date.now(),
  })

  await page.route(YADIO_EXRATES_URL, async (route) => {
    await route.fulfill({
      json: { BTC: exchangeRate, timestamp: Date.now() },
    })
  })

  await page.route("https://wallet.e2e.test/**", async (route) => {
    const response = await wallet.fetch(route.request().url())
    if (response === null) {
      await route.abort()
      return
    }
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      // The app reads the callback and verify cross-origin.
      headers: { "access-control-allow-origin": "*" },
      body: await response.text(),
    })
  })

  return wallet
}
