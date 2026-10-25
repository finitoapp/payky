import type { FakeLightningAddressWallet } from "@payky/core/integrations/lnurl/fake-lightning-address-wallet"
import type { Page } from "@playwright/test"
import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import {
  e2eLightningAddress,
  mockLightningAddressWallet,
} from "./support/lightning-address-mocks.ts"
import { gotoPage } from "./support/navigation.ts"
import { createPayment } from "./support/payment.ts"

const saveAddress = async (page: Page, address: string) => {
  await gotoPage(
    page,
    "/settings/payment-accounts/lightning-address",
    "en",
    "settings.paymentAccounts.method.lightningAddress"
  )
  await page
    .getByLabel(translate("en", "settings.lightningAddress.address.label"))
    .fill(address)
  await page
    .getByRole("button", {
      name: translate("en", "settings.lightningAddress.submit"),
    })
    .click()
}

const openLightningAddressTab = async (page: Page) => {
  await page
    .getByRole("tab", {
      name: translate("en", "paymentWait.method.lightningAddress"),
      exact: true,
    })
    .click()
  await page
    .getByRole("button", { name: translate("en", "paymentWait.copyQr") })
    .locator("svg.size-full")
    .waitFor()
}

const setUpPayment = async (
  page: Page
): Promise<FakeLightningAddressWallet> => {
  const wallet = await mockLightningAddressWallet(page)
  await saveAddress(page, e2eLightningAddress)
  await expect(
    page.getByText(translate("en", "settings.lightningAddress.saved"))
  ).toBeVisible()
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await createPayment(page, "en")
  await openLightningAddressTab(page)
  return wallet
}

test("save a Lightning address and offer it among the payment methods", async ({
  seededPage: page,
}) => {
  await test.step("route the merchant's wallet", () =>
    mockLightningAddressWallet(page))

  await test.step("save the address", async () => {
    await saveAddress(page, " Shop@Wallet.E2E.test ")
    await expect(
      page.getByText(translate("en", "settings.lightningAddress.saved"))
    ).toBeVisible()
  })

  await test.step("the payment methods list it, enabled", async () => {
    await gotoPage(
      page,
      "/settings/payment-accounts",
      "en",
      "settings.paymentAccounts.title"
    )
    await expect(page.getByText(e2eLightningAddress)).toBeVisible()
    await expect(
      page.getByRole("switch", {
        name: translate("en", "settings.lightningAddress.enabled.label"),
      })
    ).toBeChecked()
  })
})

test("refuse a wallet that cannot tell whether an invoice is paid", async ({
  seededPage: page,
}) => {
  await test.step("route a wallet without LUD-21 verify", async () => {
    const wallet = await mockLightningAddressWallet(page)
    wallet.options.verify = false
  })

  await test.step("saving the address is refused", async () => {
    await saveAddress(page, e2eLightningAddress)
    await expect(
      page.getByText(
        translate("en", "settings.lightningAddress.error.verifyUnsupported")
      )
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "settings.lightningAddress.saved"))
    ).toBeHidden()
  })
})

test("take a payment into the merchant's wallet and see it settle", async ({
  seededPage: page,
}) => {
  let wallet: FakeLightningAddressWallet | undefined

  await test.step("save the address and open the payment's tab", async () => {
    wallet = await setUpPayment(page)
  })

  await test.step("the customer pays the wallet's invoice", () => {
    expect(wallet?.payLatest()).toBe(true)
  })

  await test.step("the payment settles", async () => {
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible({ timeout: 20_000 })
  })
})

test("a wallet that says paid without a preimage does not settle the payment", async ({
  seededPage: page,
}) => {
  let wallet: FakeLightningAddressWallet | undefined

  await test.step("save the address and open the payment's tab", async () => {
    wallet = await setUpPayment(page)
    if (wallet !== undefined) wallet.options.revealsPreimage = false
  })

  await test.step("the wallet reports the invoice paid", () => {
    expect(wallet?.payLatest()).toBe(true)
  })

  await test.step("the screen warns instead of showing it paid", async () => {
    await expect(
      page.getByText(translate("en", "paymentWait.lightningAddress.unverified"))
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("payment-paid-panel")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
  })
})

test("a payment made after the screen closed is settled in the background", async ({
  seededPage: page,
}) => {
  let wallet: FakeLightningAddressWallet | undefined
  let paymentPath = ""

  await test.step("save the address and open the payment's tab", async () => {
    wallet = await setUpPayment(page)
    paymentPath = new URL(page.url()).pathname
  })

  await test.step("staff leave the screen and the customer pays", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    expect(wallet?.payLatest()).toBe(true)
  })

  await test.step("the payment reads as paid", async () => {
    const paymentId = paymentPath.split("/").at(-1) ?? ""
    await gotoPage(page, `/activity/${paymentId}`, "en", "paymentDetail.title")
    await expect(
      page.getByText(translate("en", "payment.status.paid"), { exact: true })
    ).toBeVisible({ timeout: 30_000 })
  })
})
