import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { createTestInvoice } from "@payky/core/modules/shared/lightning-invoice-test-fixtures"
import type { Page } from "@playwright/test"
import { openSettingsEntry } from "./support/access.ts"
import { mockDonationApis } from "./support/donation-mocks.ts"
import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import { toggleInlineSwitch } from "./support/inline-edit.ts"
import { gotoPage, waitForLocalWriteToSettle } from "./support/navigation.ts"
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
    await expect(
      page.getByText(translate("en", "settings.cashuMints.trusted"))
    ).toBeVisible()
    await expect(page.getByText("cashu.cz")).toBeVisible()
    await expect(
      page.getByText(translate("en", "settings.cashuMints.default"))
    ).toBeVisible()
  })
})

const minibits = "mint.minibits.cash/Bitcoin"

/** The mints screen's section titled `key`, a navigation named by it. */
const mintSection = (page: Page, key: TranslationKey) =>
  page.getByRole("navigation", { name: translate("en", key) })

test("trust a suggested mint, take a payment there, then stop trusting it with its balance", async ({
  seededPage: page,
}) => {
  test.setTimeout(90_000)

  await test.step("use the fake mints and a fixed exchange rate", async () => {
    await page.addInitScript(() => {
      window.__e2eCashuMint = true
    })
    await mockDonationApis(page)
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

  await test.step("a suggestion opens its detail, where it is trusted", async () => {
    await gotoPage(
      page,
      "/settings/payment-accounts/cashu/mints",
      "en",
      "settings.cashuMints.title"
    )
    await mintSection(page, "settings.cashuMints.suggested")
      .getByRole("link", { name: new RegExp(minibits) })
      .click()
    await expect(
      page.getByText(
        translate("en", "settings.cashuMints.notTrustedDescription")
      )
    ).toBeVisible()
    await page
      .getByRole("button", {
        name: translate("en", "settings.cashuMints.trust"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "settings.cashuMints.trustDescription"))
    ).toBeVisible()
  })

  await test.step("use it for payments: the badge moves", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.cashuMints.setDefault"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "settings.cashuMints.default"))
    ).toBeVisible()
    await waitForLocalWriteToSettle(page)
    await gotoPage(
      page,
      "/settings/payment-accounts/cashu/mints",
      "en",
      "settings.cashuMints.title"
    )
    const trusted = mintSection(page, "settings.cashuMints.trusted")
    await expect(trusted.getByRole("link")).toHaveCount(2)
    await expect(trusted.getByRole("link").first()).toContainText(minibits)
    await expect(trusted.getByRole("link").first()).toContainText(
      translate("en", "settings.cashuMints.default")
    )
  })

  await test.step("a Cashu payment is paid at the new default", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await createPayment(page, "en")
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.cashu") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentWait.copyQr") })
      .locator("svg.size-full")
      .waitFor()
    await page.waitForFunction(
      () => typeof window.__e2eCashuPayQuotes === "function"
    )
    expect(await page.evaluate(() => window.__e2eCashuPayQuotes?.())).toBe(1)
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible({ timeout: 30_000 })
  })

  await test.step("stop trusting it: its balance stays, apart", async () => {
    // The fake mints live in the page: only in-app navigation from here.
    await page
      .getByRole("button", { name: translate("en", "paymentWait.back") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "nav.settings") })
      .click()
    await openSettingsEntry(page, "en", "settings.paymentAccounts.title")
    await page
      .getByRole("link", {
        name: new RegExp(
          translate("en", "settings.paymentAccounts.method.cashu")
        ),
      })
      .first()
      .click()
    await openSettingsEntry(page, "en", "settings.cashuAccount.mints")
    await mintSection(page, "settings.cashuMints.trusted")
      .getByRole("link", { name: new RegExp(minibits) })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.cashuMints.untrust"),
      })
      .click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("cashu.cz")
    await dialog
      .getByRole("button", {
        name: translate("en", "settings.cashuMints.untrustConfirm.confirm"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "settings.cashuMints.withBalance"))
    ).toBeVisible()
    await expect(
      mintSection(page, "settings.cashuMints.withBalance").getByRole("link", {
        name: new RegExp(minibits),
      })
    ).toBeVisible()
    const trusted = mintSection(page, "settings.cashuMints.trusted")
    await expect(trusted.getByRole("link")).toHaveCount(1)
    await expect(trusted.getByRole("link")).toContainText("cashu.cz")
    await expect(trusted.getByRole("link")).toContainText(
      translate("en", "settings.cashuMints.default")
    )
  })
})

/** A 50-sat mainnet invoice valid for an hour. */
const invoice50 = () =>
  createTestInvoice({
    hrp: "lnbc500n",
    timestamp: Math.floor(Date.now() / 1000),
    expirySeconds: 3600,
  })

const fundCashuWallet = async (page: Page) => {
  await test.step("use the fake mint and a fixed exchange rate", async () => {
    await page.addInitScript(() => {
      window.__e2eCashuMint = true
    })
    await mockDonationApis(page)
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

  await test.step("take a Cashu payment so the mint holds ecash", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await createPayment(page, "en")
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.cashu") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentWait.copyQr") })
      .locator("svg.size-full")
      .waitFor()
    await page.waitForFunction(
      () => typeof window.__e2eCashuPayQuotes === "function"
    )
    expect(await page.evaluate(() => window.__e2eCashuPayQuotes?.())).toBe(1)
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible({ timeout: 30_000 })
  })
}

/** The fake mint lives in the page: only in-app navigation from the paid payment. */
const walkToNewCashuWithdrawal = (page: Page) =>
  test.step("walk to a new Cashu withdrawal", async () => {
    await page
      .getByRole("button", { name: translate("en", "paymentWait.back") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "nav.settings") })
      .click()
    await openSettingsEntry(page, "en", "settings.paymentAccounts.title")
    await page
      .getByRole("link", {
        name: new RegExp(
          translate("en", "settings.paymentAccounts.method.cashu")
        ),
      })
      .first()
      .click()
    await openSettingsEntry(page, "en", "settings.cashuAccount.withdraw")
    await expect(
      page.getByText(translate("en", "withdraw.history.empty"))
    ).toBeVisible()
    await page
      .getByRole("button", { name: translate("en", "withdraw.history.new") })
      .click()
  })

test("withdraw from a mint to a Lightning invoice and follow it on its detail", async ({
  seededPage: page,
}) => {
  test.setTimeout(60_000)
  await fundCashuWallet(page)

  await walkToNewCashuWithdrawal(page)

  const destination = page.getByLabel(
    translate("en", "withdraw.destination.label")
  )
  await test.step("an on-chain address is refused while typing", async () => {
    await destination.fill("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")
    await expect(
      page.getByText(translate("en", "withdraw.cashu.error.onchain"))
    ).toBeVisible()
  })

  await test.step("an invoice sets the amount; review the mint's fees", async () => {
    await destination.fill(invoice50())
    await expect(
      page.getByLabel(translate("en", "withdraw.amount.label"), { exact: true })
    ).toHaveValue("50")
    await expect(
      page.getByLabel(translate("en", "withdraw.amount.label"), { exact: true })
    ).toBeDisabled()
    await page
      .getByRole("button", { name: translate("en", "withdraw.continue") })
      .click()
    await expect(
      page.getByText(translate("en", "withdraw.review.title"))
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "withdraw.cashu.review.feeReserve"))
    ).toBeVisible()
  })

  await test.step("confirming pays it and opens its detail", async () => {
    await page
      .getByRole("button", { name: translate("en", "withdraw.review.confirm") })
      .click()
    await expect(
      page.getByRole("heading", {
        name: translate("en", "withdraw.detail.title"),
      })
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "withdraw.status.done"))
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "withdraw.kind.cashu"))
    ).toBeVisible()
  })
})

test("withdraw all from a mint to a Lightning address", async ({
  seededPage: page,
}) => {
  test.setTimeout(60_000)
  await fundCashuWallet(page)
  await walkToNewCashuWithdrawal(page)

  await test.step("a Lightning address offers withdraw all", async () => {
    await page
      .getByLabel(translate("en", "withdraw.destination.label"))
      .fill("donate@payky.me")
    await expect(
      page.getByText(
        translate("en", "withdraw.destination.kind.lightningAddress"),
        { exact: true }
      )
    ).toBeVisible()
    await page
      .getByRole("checkbox", { name: translate("en", "withdraw.all.label") })
      .check()
    await expect(
      page.getByLabel(translate("en", "withdraw.amount.label"), { exact: true })
    ).toBeDisabled()
    await page
      .getByRole("button", { name: translate("en", "withdraw.continue") })
      .click()
    await expect(
      page.getByText(translate("en", "withdraw.review.title"))
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "withdraw.cashu.review.feeReserve"))
    ).toBeVisible()
  })

  await test.step("confirming pays it and opens its detail", async () => {
    await page
      .getByRole("button", { name: translate("en", "withdraw.review.confirm") })
      .click()
    await expect(
      page.getByText(translate("en", "withdraw.status.done"))
    ).toBeVisible()
  })
})

test("an account without Cashu reaches no mint", async ({
  seededPage: page,
}) => {
  // A payment, a settings page and five quiet seconds for a late request.
  test.setTimeout(60_000)
  // cashu-ts talks to mints from the page, so a page request is a mint
  // contact.
  const mintRequests: string[] = []
  page.on("request", (request) => {
    if (
      /\/v1\/(info|keys|keysets|mint|melt|swap|checkstate|restore)\b/u.test(
        request.url()
      )
    )
      mintRequests.push(request.url())
  })

  await test.step("use the app with Cashu off", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await createPayment(page, "en")
    await gotoPage(
      page,
      "/settings/payment-accounts",
      "en",
      "settings.paymentAccounts.title"
    )
    await page.waitForTimeout(5_000)
  })

  await test.step("no mint was asked", async () => {
    expect(mintRequests).toEqual([])
  })
})
