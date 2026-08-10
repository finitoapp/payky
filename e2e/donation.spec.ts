import type { Page } from "@playwright/test"
import { mockDonationApis } from "./donation-mocks.ts"
import { expect, test, translate } from "./fixtures.ts"

// Not gotoPage(): the donations page's heading ("Donations") is a substring
// match of the donation-history empty state's heading ("No donations yet"),
// which makes gotoPage's non-exact getByRole ambiguous.
async function openDonationsPage(page: Page): Promise<void> {
  await page.goto("/settings/donations", { waitUntil: "domcontentloaded" })
  await page
    .getByRole("heading", {
      name: translate("en", "settings.donations.title"),
      exact: true,
    })
    .waitFor()
}

test("create a donation invoice then simulate the incoming payment", async ({
  seededPage: page,
}) => {
  const donationMocks =
    await test.step("mock Yadio, LNURL, and donation history APIs", () =>
      mockDonationApis(page))

  await test.step("open the donations page", () => openDonationsPage(page))

  await test.step("enter a sats amount and create the invoice", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.donations.sats.label"),
      })
      .fill("1000")
    await page
      .getByRole("button", {
        name: translate("en", "settings.donations.create"),
      })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.donations.invoice.title"),
      })
      .waitFor()
  })

  await test.step("verify the invoice QR renders and payment is awaited", async () => {
    await expect(
      page
        .getByRole("button", {
          name: translate("en", "settings.donations.invoice.copy"),
        })
        .locator("svg")
    ).toBeVisible()
    await expect(
      page.getByText(
        translate("en", "settings.donations.invoice.verify.waiting")
      )
    ).toBeVisible()
  })

  await test.step("simulate the incoming Lightning payment", async () => {
    donationMocks.setSettled(true)
    await expect(
      page.getByText(translate("en", "settings.donations.invoice.verify.paid"))
    ).toBeVisible()
  })

  await test.step("return to settings", async () => {
    // `nativeButton={false}` on this Button makes Base UI force role="button"
    // onto the rendered <Link>, so it's not `getByRole("link", ...)`.
    await page
      .getByRole("button", {
        name: translate("en", "settings.donations.invoice.backToSettings"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "settings.title") })
      .waitFor()
  })
})

test("donation amount is validated against the LNURL sendable range", async ({
  seededPage: page,
}) => {
  await test.step("mock Yadio, LNURL, and donation history APIs", () =>
    mockDonationApis(page, { minSendableSats: 100, maxSendableSats: 500 }))

  await test.step("open the donations page", () => openDonationsPage(page))

  await test.step("enter an amount above the allowed range", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.donations.sats.label"),
      })
      .fill("999")
    await expect(
      page.getByText(translate("en", "settings.donations.amount.range"))
    ).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: translate("en", "settings.donations.create"),
      })
    ).toBeDisabled()
  })

  await test.step("enter an amount inside the allowed range", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.donations.sats.label"),
      })
      .fill("200")
    await expect(
      page.getByRole("button", {
        name: translate("en", "settings.donations.create"),
      })
    ).toBeEnabled()
  })
})
