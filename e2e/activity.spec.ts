import {
  createPayment,
  expect,
  gotoPage,
  markCashPaid,
  simulateCancelAfterClaim,
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
    simulateCancelAfterClaim(page))

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
