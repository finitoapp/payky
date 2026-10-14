import { mockDonationApis } from "./support/donation-mocks.ts"
import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import { toggleInlineSwitch } from "./support/inline-edit.ts"
import { gotoPage } from "./support/navigation.ts"
import { createPayment } from "./support/payment.ts"

test("enable Cashu, take a payment over the mint's invoice and see it settle", async ({
  seededPage: page,
}) => {
  // The Cashu job polls a fresh quote every 5 s.
  test.setTimeout(60_000)

  await test.step("use the fake mint and a fixed exchange rate", async () => {
    await page.addInitScript(() => {
      window.__e2eCashuMint = true
    })
    await mockDonationApis(page)
  })

  await test.step("enable Cashu in the payment methods", async () => {
    await gotoPage(
      page,
      "/settings/payment-accounts",
      "en",
      "settings.paymentAccounts.title"
    )
    await toggleInlineSwitch(page, "settings.cashuAccount.enabled.label")
  })

  await test.step("create a payment", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await createPayment(page, "en")
  })

  await test.step("open the Cashu tab and wait for the QR", async () => {
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.cashu") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentWait.copyQr") })
      .locator("svg.size-full")
      .waitFor()
  })

  await test.step("the customer pays the mint's invoice", async () => {
    await page.waitForFunction(
      () => typeof window.__e2eCashuPayQuotes === "function"
    )
    expect(await page.evaluate(() => window.__e2eCashuPayQuotes?.())).toBe(1)
  })

  await test.step("the payment settles", async () => {
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible({ timeout: 30_000 })
  })
})

test("the mints screen lists the default mint with its balance", async ({
  seededPage: page,
}) => {
  await test.step("use the fake mint", async () => {
    await page.addInitScript(() => {
      window.__e2eCashuMint = true
    })
  })

  await test.step("enable Cashu", async () => {
    await gotoPage(
      page,
      "/settings/payment-accounts",
      "en",
      "settings.paymentAccounts.title"
    )
    await toggleInlineSwitch(page, "settings.cashuAccount.enabled.label")
  })

  await test.step("open the mints", async () => {
    await gotoPage(
      page,
      "/settings/payment-accounts/cashu/mints",
      "en",
      "settings.cashuMints.title"
    )
    await expect(page.getByText("cashu.cz")).toBeVisible()
    await expect(
      page.getByText(translate("en", "settings.cashuMints.default"))
    ).toBeVisible()
  })
})
