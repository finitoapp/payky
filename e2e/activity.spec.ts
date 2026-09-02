import {
  addCatalogItem,
  createPayment,
  expect,
  gotoPage,
  gotoPosOverview,
  markCashPaid,
  prepareIbanPayment,
  simulateBillModifiedDuringPayment,
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

/** `translate()` for a `{name}`-templated key, e.g. `"bill.brick.add.aria"`. */
const nameParam = (key: Parameters<typeof translate>[1], name: string) =>
  translate("en", key).replace("{name}", name)

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

/**
 * Starts a fresh bill, adds one "Coffee" ($5) brick to it, and begins a cash
 * payment for it (skipping the tip screen) — the shared setup for both
 * coverage-mismatch scenarios below. Returns the bill id read off the bill
 * page's URL before charging. Uses `gotoPosOverview` (tolerant of already
 * being in POS/tables mode, e.g. right after a previous bill's pay cycle in
 * the same test) rather than assuming the numpad is showing.
 */
async function startBillAndBeginCashPayment(
  page: Parameters<typeof gotoPosOverview>[0]
): Promise<string> {
  await gotoPosOverview(page, "en")
  await page
    .getByTestId("no-table-tile")
    .getByRole("link", { name: translate("en", "tables.tile.newBill") })
    .click()
  await page
    .getByRole("heading", { name: translate("en", "bill.title") })
    .waitFor()
  await page
    .getByRole("button", { name: nameParam("bill.brick.add.aria", "Coffee") })
    .click()

  await expect
    .poll(() => new URL(page.url()).searchParams.get("billId"))
    .not.toBeNull()
  const billId = new URL(page.url()).searchParams.get("billId")
  if (!billId) {
    throw new Error("Could not determine bill id from URL.")
  }

  await page.getByRole("button", { name: translate("en", "home.pay") }).click()
  const skipTipButton = page.getByRole("button", {
    name: translate("en", "paymentTip.none"),
  })
  const cashPaidButton = page.getByRole("button", {
    name: translate("en", "paymentWait.cashPaid.action"),
  })
  await skipTipButton.or(cashPaidButton).first().waitFor()
  if (await skipTipButton.isVisible()) {
    await skipTipButton.click()
    await page
      .getByRole("button", { name: translate("en", "paymentTip.continue") })
      .click()
    await cashPaidButton.waitFor()
  }

  return billId
}

test("the payment detail shows the bill's coverage as underpaid or overpaid when another device edits it mid-payment", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })

  await test.step("underpaid: another device adds an item while the payment is in flight", async () => {
    const billId = await startBillAndBeginCashPayment(page)

    // Simulates a CRDT merge race, not a real second payment: while this
    // device's $5 payment is in flight, another (still offline) device adds
    // an item to the same bill, growing its total past that payment's
    // already-fixed amount. See docs/bill-payment-states.md's "Bill payment
    // coverage" section.
    await simulateBillModifiedDuringPayment(page, billId, "add")
    await markCashPaid(page, "en")

    await page
      .getByTestId("payment-paid-panel")
      .getByRole("button", { name: translate("en", "paymentWait.detail") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentDetail.title") })
      .waitFor()
    await expect(
      page.getByText(
        translate("en", "paymentDetail.bill.coverage.underpaid.title")
      )
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/payment-detail-bill-underpaid.png`,
      fullPage: true,
    })
  })

  await test.step("overpaid: another device removes the item while the payment is in flight", async () => {
    const billId = await startBillAndBeginCashPayment(page)

    // Same race, opposite direction: the other device removes the bill's
    // only item, shrinking its total below the payment's already-fixed
    // amount.
    await simulateBillModifiedDuringPayment(page, billId, "removeAll")
    await markCashPaid(page, "en")

    await page
      .getByTestId("payment-paid-panel")
      .getByRole("button", { name: translate("en", "paymentWait.detail") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentDetail.title") })
      .waitFor()
    await expect(
      page.getByText(
        translate("en", "paymentDetail.bill.coverage.overpaid.title")
      )
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/payment-detail-bill-overpaid.png`,
      fullPage: true,
    })
  })
})

test("a payment with both a cancellation collision and an overpaid bill shows both issues in the list, separated by a middle dot", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })

  await test.step("set up a payment that ends up both canceled+claimed and tied to an overpaid bill", async () => {
    const billId = await startBillAndBeginCashPayment(page)
    await simulateBillModifiedDuringPayment(page, billId, "removeAll")
    await markCashPaid(page, "en")
    await simulateCancelAfterClaim(page, "en")
  })

  await test.step("the activity list shows both issues on the same row, joined by a middle dot", async () => {
    await gotoPage(page, "/activity", "en", "activity.title")
    await expect(
      page.getByText(
        `${translate("en", "paymentHistory.collision")} · ${translate("en", "paymentHistory.billOverpaid")}`
      )
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/activity-list-multiple-issues.png`,
      fullPage: true,
    })
  })
})
