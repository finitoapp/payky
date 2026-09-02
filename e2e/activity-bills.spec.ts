import {
  addCatalogItem,
  addTable,
  cancelBillDirectly,
  expect,
  gotoPage,
  markCashPaid,
  simulateBillModifiedDuringPayment,
  simulateCancelAfterClaim,
  startBillAndBeginCashPayment,
  startBillWithCoffee,
  startNewBill,
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

/**
 * Right after `markCashPaid`, a hard navigation (`gotoPosOverview`'s
 * `page.goto("/")`, or a fresh `gotoPage`) can otherwise race ahead of that
 * write settling — see `simulateCancelAfterClaim`'s doc comment in
 * fixtures.ts and bill.spec.ts's "closing the bill after cash payment is a
 * fire-and-forget write" comment for the same caveat. Give it a moment to
 * settle before navigating.
 */
async function markCashPaidAndSettle(
  page: Parameters<typeof markCashPaid>[0]
): Promise<void> {
  await markCashPaid(page, "en")
  await page.waitForTimeout(1000)
}

test("the bills list shows every bill status and coverage edge case at once", async ({
  seededPage: page,
}) => {
  // Six full bill/payment cycles through the real UI, each followed by a
  // settle wait, comfortably exceed Playwright's default 30s test timeout.
  test.setTimeout(120_000)

  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })

  let openBillId = ""
  let canceledBillId = ""
  let closedBillId = ""
  let underpaidBillId = ""
  let overpaidBillId = ""
  let collisionBillId = ""

  await test.step("an ordinary open bill with nothing paid yet", async () => {
    openBillId = await startBillWithCoffee(page, "en")
  })

  await test.step("an ordinary canceled bill, discarded before any payment", async () => {
    canceledBillId = await startBillWithCoffee(page, "en")
    await page
      .getByRole("button", { name: translate("en", "bill.discard") })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "bill.discard.confirm.confirm"),
      })
      .click()
    await page.getByTestId("no-table-tile").waitFor()
  })

  await test.step("an ordinary closed bill, fully paid", async () => {
    closedBillId = await startBillAndBeginCashPayment(page, "en")
    await markCashPaidAndSettle(page)
  })

  await test.step("an underpaid bill: another device grew the total while the payment was in flight", async () => {
    underpaidBillId = await startBillAndBeginCashPayment(page, "en")
    await simulateBillModifiedDuringPayment(page, underpaidBillId, "add")
    await markCashPaidAndSettle(page)
  })

  await test.step("an overpaid bill: another device shrank the total while the payment was in flight", async () => {
    overpaidBillId = await startBillAndBeginCashPayment(page, "en")
    await simulateBillModifiedDuringPayment(page, overpaidBillId, "removeAll")
    await markCashPaidAndSettle(page)
  })

  await test.step("a canceled+funded collision bill: discarded while its payment was pending, then confirmed anyway", async () => {
    collisionBillId = await startBillAndBeginCashPayment(page, "en")
    await cancelBillDirectly(page, collisionBillId)
    await markCashPaidAndSettle(page)
  })

  await test.step("the bills list shows every state at once", async () => {
    await gotoPage(page, "/activity/bills", "en", "activity.title")

    const row = (billId: string) =>
      page.locator("nav").locator(`a[href$="/${billId}"]`)

    await expect(row(openBillId)).toContainText(
      translate("en", "billHistory.status.open")
    )
    await expect(row(openBillId)).not.toContainText(
      translate("en", "billHistory.underpaid")
    )
    await expect(row(openBillId)).not.toContainText(
      translate("en", "billHistory.overpaid")
    )
    await expect(row(openBillId)).not.toContainText(
      translate("en", "bill.collision.title")
    )

    await expect(row(canceledBillId)).toContainText(
      translate("en", "billHistory.status.canceled")
    )
    await expect(row(canceledBillId)).not.toContainText(
      translate("en", "bill.collision.title")
    )

    await expect(row(closedBillId)).toContainText(
      translate("en", "billHistory.status.closed")
    )
    await expect(row(closedBillId)).not.toContainText(
      translate("en", "billHistory.underpaid")
    )
    await expect(row(closedBillId)).not.toContainText(
      translate("en", "billHistory.overpaid")
    )

    await expect(row(underpaidBillId)).toContainText(
      translate("en", "billHistory.status.open")
    )
    await expect(row(underpaidBillId)).toContainText(
      translate("en", "billHistory.underpaid")
    )

    await expect(row(overpaidBillId)).toContainText(
      translate("en", "billHistory.status.closed")
    )
    await expect(row(overpaidBillId)).toContainText(
      translate("en", "billHistory.overpaid")
    )

    await expect(row(collisionBillId)).toContainText(
      translate("en", "billHistory.status.canceled")
    )
    await expect(row(collisionBillId)).toContainText(
      translate("en", "bill.collision.title")
    )

    await page.screenshot({
      path: `${screenshotDir}/activity-bills-list-edge-cases.png`,
      fullPage: true,
    })
  })
})

test("clicking a bill row in the list opens its detail page", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillAndBeginCashPayment(page, "en")
  await markCashPaidAndSettle(page)

  await gotoPage(page, "/activity/bills", "en", "activity.title")
  await page.locator("nav").locator(`a[href$="/${billId}"]`).click()

  await page
    .getByRole("heading", { name: translate("en", "billDetail.title") })
    .waitFor()
  expect(page.url()).toContain(`/activity/bills/${billId}`)
  await expect(
    page.getByText(translate("en", "paymentDetail.bill.status.closed"))
  ).toBeVisible()
  await page.screenshot({
    path: `${screenshotDir}/activity-bill-detail.png`,
    fullPage: true,
  })
})

test("the bill detail page shows an invalid id or a missing bill message", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })

  await test.step("an invalid id shows the invalid-id message", async () => {
    await page.goto("/activity/bills/not-a-real-id", {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByRole("heading", { name: translate("en", "billDetail.title") })
      .waitFor()
    await expect(
      page.getByText(translate("en", "billDetail.invalidId"))
    ).toBeVisible()
  })

  await test.step("a well-formed but unknown id shows the not-found message", async () => {
    const billId = await startBillWithCoffee(page, "en")
    // A well-formed but never-issued id: real ids encode trailing padding
    // bits in their last character, so only the first character of a known
    // valid id is swapped, keeping the rest (and its encoding) untouched.
    const missingBillId = `${billId[0] === "a" ? "b" : "a"}${billId.slice(1)}`
    await page.goto(`/activity/bills/${missingBillId}`, {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByRole("heading", { name: translate("en", "billDetail.title") })
      .waitFor()
    await expect(
      page.getByText(translate("en", "billDetail.notFound"))
    ).toBeVisible()
  })
})

test("the bill detail page shows the total, items, table, and linked payment", async ({
  seededPage: page,
}) => {
  await addTable(page, "en", { name: "Patio 1", seatCount: "4" })
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await startNewBill(page, "en")
  await page
    .getByRole("button", { name: translate("en", "bill.table.aria") })
    .click()
  const tableDialog = page.getByRole("dialog", {
    name: translate("en", "bill.table.dialog.title"),
  })
  await tableDialog.getByRole("button", { name: "Patio 1" }).click()
  await expect(tableDialog).not.toBeVisible()

  await page
    .getByRole("button", { name: nameParam("bill.brick.add.aria", "Coffee") })
    .click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get("billId"))
    .not.toBeNull()
  const billId = new URL(page.url()).searchParams.get("billId") ?? ""

  await page.getByRole("button", { name: translate("en", "home.pay") }).click()
  await page
    .getByRole("button", { name: translate("en", "paymentTip.none") })
    .click()
  await page
    .getByRole("button", { name: translate("en", "paymentTip.continue") })
    .click()
  await markCashPaidAndSettle(page)

  await page.goto(`/activity/bills/${billId}`, {
    waitUntil: "domcontentloaded",
  })
  await page
    .getByRole("heading", { name: translate("en", "billDetail.title") })
    .waitFor()

  await expect(
    page.getByText(translate("en", "paymentDetail.bill.status.closed"))
  ).toBeVisible()
  await expect(page.locator("strong", { hasText: "$5.00" })).toBeVisible()
  await expect(page.getByText("Coffee")).toBeVisible()
  await expect(page.getByText("Patio 1")).toBeVisible()
  await expect(
    page
      .getByRole("link")
      .filter({ hasText: translate("en", "paymentDetail.status.paid") })
  ).toBeVisible()
  await page.screenshot({
    path: `${screenshotDir}/activity-bill-detail-full.png`,
    fullPage: true,
  })
})

test("the bill detail page shows coverage as underpaid or overpaid when another device edits it mid-payment", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })

  await test.step("underpaid: another device grows the total while the payment is in flight", async () => {
    const billId = await startBillAndBeginCashPayment(page, "en")
    await simulateBillModifiedDuringPayment(page, billId, "add")
    await markCashPaidAndSettle(page)

    await page.goto(`/activity/bills/${billId}`, {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByRole("heading", { name: translate("en", "billDetail.title") })
      .waitFor()
    await expect(
      page.getByText(
        translate("en", "paymentDetail.bill.coverage.underpaid.title")
      )
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/activity-bill-detail-underpaid.png`,
      fullPage: true,
    })
  })

  await test.step("overpaid: another device shrinks the total while the payment is in flight", async () => {
    const billId = await startBillAndBeginCashPayment(page, "en")
    await simulateBillModifiedDuringPayment(page, billId, "removeAll")
    await markCashPaidAndSettle(page)

    await page.goto(`/activity/bills/${billId}`, {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByRole("heading", { name: translate("en", "billDetail.title") })
      .waitFor()
    await expect(
      page.getByText(
        translate("en", "paymentDetail.bill.coverage.overpaid.title")
      )
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/activity-bill-detail-overpaid.png`,
      fullPage: true,
    })
  })
})

test("the bill detail page flags a canceled+funded collision and can be resolved", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })

  const billId = await startBillAndBeginCashPayment(page, "en")
  await cancelBillDirectly(page, billId)
  await markCashPaidAndSettle(page)

  await page.goto(`/activity/bills/${billId}`, {
    waitUntil: "domcontentloaded",
  })
  await page
    .getByRole("heading", { name: translate("en", "billDetail.title") })
    .waitFor()

  await test.step("shows the collision message", async () => {
    await expect(
      page.getByText(translate("en", "bill.collision.title"))
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "bill.collision.description"))
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/activity-bill-detail-collision.png`,
      fullPage: true,
    })
  })

  await test.step("resolving the collision flips the bill to closed", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "bill.collision.markClosed"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "bill.collision.title"))
    ).toBeHidden()
    await expect(
      page.getByText(translate("en", "paymentDetail.bill.status.closed"))
    ).toBeVisible()
    await page.screenshot({
      path: `${screenshotDir}/activity-bill-detail-collision-resolved.png`,
      fullPage: true,
    })
  })
})

test("a payment individually canceled after being claimed shows a warning icon in the bill detail's payments list", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillAndBeginCashPayment(page, "en")
  await markCashPaid(page, "en")
  await simulateCancelAfterClaim(page, "en")

  await page.goto(`/activity/bills/${billId}`, {
    waitUntil: "domcontentloaded",
  })
  await page
    .getByRole("heading", { name: translate("en", "billDetail.title") })
    .waitFor()

  await expect(
    page
      .getByRole("link")
      .filter({ hasText: translate("en", "paymentDetail.status.canceled") })
  ).toBeVisible()
  await page.screenshot({
    path: `${screenshotDir}/activity-bill-detail-payment-collision.png`,
    fullPage: true,
  })
})
