import {
  createPayment,
  expect,
  gotoPage,
  markCashPaid,
  prepareIbanPayment,
  simulateCancelAfterClaim,
  simulateDuplicateSettlement,
  test,
  translate,
} from "./fixtures.ts"

/**
 * Playwright's own artifact directory (already git-ignored — see
 * .gitignore's "Playwright" section) — screenshots taken explicitly by a
 * spec live alongside its auto-captured failure screenshots instead of a
 * new, separately-ignored directory.
 */
const screenshotDir = "test-results/e2e-screenshots"

test("a paid payment shows up in activity list and detail", async ({
  seededPage: page,
}) => {
  await test.step("create a cash payment", () => createPayment(page, "en"))
  await test.step("mark the payment as paid", () => markCashPaid(page, "en"))

  await test.step("open activity from the paid confirmation", async () => {
    await page
      .getByTestId("payment-paid-panel")
      .getByRole("button", { name: translate("en", "paymentWait.detail") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentDetail.title") })
      .waitFor()
  })

  await test.step("verify the payment detail shows paid status", async () => {
    await expect(
      page.getByText(translate("en", "paymentDetail.status.paid"), {
        exact: true,
      })
    ).toBeVisible()
  })

  await test.step("navigate to the activity list", () =>
    gotoPage(page, "/activity", "en", "activity.title"))

  await test.step("open the payment from the activity list", async () => {
    await page
      .locator("nav")
      .getByRole("link", {
        name: translate("en", "paymentHistory.status.paid"),
      })
      .first()
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentDetail.title") })
      .waitFor()
    await expect(
      page.getByText(translate("en", "paymentDetail.status.paid"), {
        exact: true,
      })
    ).toBeVisible()
  })
})

test("a canceled+claimed payment collision is flagged in the activity list and detail, and can be resolved", async ({
  seededPage: page,
}) => {
  await test.step("create and claim a cash payment", async () => {
    await createPayment(page, "en")
    await markCashPaid(page, "en")
  })

  await test.step("simulate a CRDT merge race that cancels the already-claimed payment", () =>
    simulateCancelAfterClaim(page, "en"))

  await test.step("the activity list flags the collision", async () => {
    await gotoPage(page, "/activity", "en", "activity.title")
    await expect(
      page.getByText(translate("en", "paymentHistory.collision"))
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/activity-list-collision.png`,
      fullPage: true,
    })
  })

  await test.step("opening the payment shows the collision warning on the detail page", async () => {
    await page
      .locator("nav")
      .getByRole("link", {
        name: translate("en", "paymentHistory.collision"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentDetail.title") })
      .waitFor()
    await expect(
      page.getByText(translate("en", "paymentDetail.collision.title"))
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/payment-detail-collision.png`,
      fullPage: true,
    })
  })

  await test.step("resolving the collision flips the payment's display back to paid", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "paymentDetail.collision.markPaid"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "paymentDetail.collision.title"))
    ).toBeHidden()
    await expect(
      page.getByText(translate("en", "paymentDetail.status.paid"), {
        exact: true,
      })
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/payment-detail-resolved.png`,
      fullPage: true,
    })
  })

  await test.step("the activity list no longer flags the resolved payment", async () => {
    await gotoPage(page, "/activity", "en", "activity.title")
    await expect(
      page.getByText(translate("en", "paymentHistory.collision"))
    ).toBeHidden()
    await expect(
      page
        .locator("nav")
        .getByRole("link", {
          name: translate("en", "paymentHistory.status.paid"),
        })
        .first()
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/activity-list-resolved.png`,
      fullPage: true,
    })
  })
})

test("a duplicate-settlement payment collision is flagged in the payment detail and can be resolved", async ({
  seededPage: page,
}) => {
  await test.step("create and claim a cash payment, also preparing IBAN as an offered method", async () => {
    await createPayment(page, "en")
    // Visiting the IBAN tab is what actually prepares it (`preparePaymentMethod`
    // is lazy, per-tab) — needed so `simulateDuplicateSettlement` below has
    // IBAN details to settle against. Switch back to the cash tab afterward,
    // since `markCashPaid`'s button only renders while it's active.
    await prepareIbanPayment(page, "en")
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.cash") })
      .click()
    await markCashPaid(page, "en")
  })

  await test.step("simulate a second offline device settling the same payment via IBAN", () =>
    simulateDuplicateSettlement(page))

  await test.step("opening the payment detail shows the duplicate-settlement warning", async () => {
    await page
      .getByTestId("payment-paid-panel")
      .getByRole("button", { name: translate("en", "paymentWait.detail") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentDetail.title") })
      .waitFor()
    await expect(
      page.getByText(translate("en", "paymentDetail.excessCollision.title"))
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/payment-detail-excess-collision.png`,
      fullPage: true,
    })
  })

  await test.step("resolving the collision hides the warning and keeps the payment paid", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "paymentDetail.excessCollision.acknowledge"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "paymentDetail.excessCollision.title"))
    ).toBeHidden()
    await expect(
      page.getByText(translate("en", "paymentDetail.status.paid"), {
        exact: true,
      })
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/payment-detail-excess-resolved.png`,
      fullPage: true,
    })
  })
})
