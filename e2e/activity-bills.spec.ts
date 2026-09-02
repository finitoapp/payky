import {
  addCatalogItem,
  addTable,
  cancelBillDirectly,
  expect,
  gotoPage,
  markCashPaid,
  markCashPaidAndSettle,
  nameParam,
  screenshotDir,
  simulateBillModifiedDuringPayment,
  simulateCancelAfterClaim,
  startBillAndBeginCashPayment,
  startBillWithCoffee,
  startNewBill,
  test,
  translate,
} from "./fixtures.ts"

/** Locates a bill's row in the `/activity/bills` list by its id. */
const billRow = (page: Parameters<typeof markCashPaid>[0], billId: string) =>
  page.locator("nav").locator(`a[href$="/${billId}"]`)

test("the bills list shows an ordinary open bill with nothing paid yet", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillWithCoffee(page, "en")

  await gotoPage(page, "/activity/bills", "en", "activity.title")
  const row = billRow(page, billId)
  await expect(row).toContainText(translate("en", "billHistory.status.open"))
  await expect(row).not.toContainText(translate("en", "billHistory.underpaid"))
  await expect(row).not.toContainText(translate("en", "billHistory.overpaid"))
  await expect(row).not.toContainText(translate("en", "bill.collision.title"))
  await page.screenshot({
    path: `${screenshotDir}/activity-bills-list-open.png`,
    fullPage: true,
  })
})

test("the bills list shows an ordinary canceled bill, discarded before any payment", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillWithCoffee(page, "en")
  await page
    .getByRole("button", { name: translate("en", "bill.discard") })
    .click()
  await page
    .getByRole("button", {
      name: translate("en", "bill.discard.confirm.confirm"),
    })
    .click()
  await page.getByTestId("no-table-tile").waitFor()

  await gotoPage(page, "/activity/bills", "en", "activity.title")
  const row = billRow(page, billId)
  await expect(row).toContainText(
    translate("en", "billHistory.status.canceled")
  )
  await expect(row).not.toContainText(translate("en", "bill.collision.title"))
  await page.screenshot({
    path: `${screenshotDir}/activity-bills-list-canceled.png`,
    fullPage: true,
  })
})

test("the bills list shows an ordinary closed bill, fully paid", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillAndBeginCashPayment(page, "en")
  await markCashPaidAndSettle(page, "en")

  await gotoPage(page, "/activity/bills", "en", "activity.title")
  const row = billRow(page, billId)
  await expect(row).toContainText(translate("en", "billHistory.status.closed"))
  await expect(row).not.toContainText(translate("en", "billHistory.underpaid"))
  await expect(row).not.toContainText(translate("en", "billHistory.overpaid"))
  await page.screenshot({
    path: `${screenshotDir}/activity-bills-list-closed.png`,
    fullPage: true,
  })
})

test("the bills list shows an underpaid bill when another device grew the total while the payment was in flight", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillAndBeginCashPayment(page, "en")
  await simulateBillModifiedDuringPayment(page, billId, "add")
  await markCashPaidAndSettle(page, "en")

  await gotoPage(page, "/activity/bills", "en", "activity.title")
  const row = billRow(page, billId)
  await expect(row).toContainText(translate("en", "billHistory.status.open"))
  await expect(row).toContainText(translate("en", "billHistory.underpaid"))
  await page.screenshot({
    path: `${screenshotDir}/activity-bills-list-underpaid.png`,
    fullPage: true,
  })
})

test("the bills list shows an overpaid bill when another device shrank the total while the payment was in flight", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillAndBeginCashPayment(page, "en")
  await simulateBillModifiedDuringPayment(page, billId, "removeAll")
  await markCashPaidAndSettle(page, "en")

  await gotoPage(page, "/activity/bills", "en", "activity.title")
  const row = billRow(page, billId)
  await expect(row).toContainText(translate("en", "billHistory.status.closed"))
  await expect(row).toContainText(translate("en", "billHistory.overpaid"))
  await page.screenshot({
    path: `${screenshotDir}/activity-bills-list-overpaid.png`,
    fullPage: true,
  })
})

test("the bills list shows a canceled+funded collision bill discarded while its payment was pending, then confirmed anyway", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillAndBeginCashPayment(page, "en")
  await cancelBillDirectly(page, billId)
  await markCashPaidAndSettle(page, "en")

  await gotoPage(page, "/activity/bills", "en", "activity.title")
  const row = billRow(page, billId)
  await expect(row).toContainText(
    translate("en", "billHistory.status.canceled")
  )
  await expect(row).toContainText(translate("en", "bill.collision.title"))
  await page.screenshot({
    path: `${screenshotDir}/activity-bills-list-collision.png`,
    fullPage: true,
  })
})

test("clicking a bill row in the list opens its detail page", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  const billId = await startBillAndBeginCashPayment(page, "en")
  await markCashPaidAndSettle(page, "en")

  await gotoPage(page, "/activity/bills", "en", "activity.title")
  await billRow(page, billId).click()

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
    await gotoPage(
      page,
      "/activity/bills/not-a-real-id",
      "en",
      "billDetail.title"
    )
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
    await gotoPage(
      page,
      `/activity/bills/${missingBillId}`,
      "en",
      "billDetail.title"
    )
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
  await markCashPaidAndSettle(page, "en")

  await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")

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
    await markCashPaidAndSettle(page, "en")

    await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")
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
    await markCashPaidAndSettle(page, "en")

    await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")
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
  await markCashPaidAndSettle(page, "en")

  await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")

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

  await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")

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
