import {
  addCatalogItem,
  addTaxRate,
  expect,
  gotoPage,
  gotoPosOverview,
  markCashPaid,
  nameParam,
  test,
  translate,
  waitForLocalWriteToSettle,
} from "./fixtures.ts"

test("shows a VAT breakdown by tax rate on the bill and payment detail", async ({
  seededPage: page,
}) => {
  await test.step("create two tax rates", async () => {
    await addTaxRate(page, "en", { name: "Standard rate", rate: "21" })
    await addTaxRate(page, "en", { name: "Reduced rate", rate: "12" })
  })

  await test.step("create one item per rate, with clean round amounts", async () => {
    // 121.00 at 21% inclusive splits into base 100.00 + VAT 21.00.
    await addCatalogItem(page, "en", {
      name: "Coffee",
      price: "121",
      taxRateName: "Standard rate",
    })
    // 112.00 at 12% inclusive splits into base 100.00 + VAT 12.00.
    await addCatalogItem(page, "en", {
      name: "Tea",
      price: "112",
      taxRateName: "Reduced rate",
    })
  })

  let billId = ""

  await test.step("start a bill with both items", async () => {
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
    await page
      .getByRole("button", { name: nameParam("bill.brick.add.aria", "Tea") })
      .click()

    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .not.toBeNull()
    billId = new URL(page.url()).searchParams.get("billId") ?? ""
  })

  await test.step("the bill detail shows the VAT breakdown by rate", async () => {
    await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")
    await expect(
      page.getByText(translate("en", "taxRecap.title"))
    ).toBeVisible()
    await expect(page.getByText("Standard rate (21%)")).toBeVisible()
    await expect(page.getByText("Reduced rate (12%)")).toBeVisible()
    await expect(page.getByText("Base: $100.00 · VAT: $21.00")).toBeVisible()
    await expect(page.getByText("Base: $100.00 · VAT: $12.00")).toBeVisible()
  })

  await test.step("pay the bill", async () => {
    await page
      .getByRole("button", { name: translate("en", "billDetail.backToBill") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "home.pay") })
      .click()
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
    await markCashPaid(page, "en")
  })

  await test.step("the payment detail shows the same VAT breakdown", async () => {
    await page
      .getByTestId("payment-paid-panel")
      .getByRole("button", { name: translate("en", "paymentWait.detail") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentDetail.title") })
      .waitFor()

    await expect(
      page.getByText(translate("en", "taxRecap.title"))
    ).toBeVisible()
    await expect(page.getByText("Standard rate (21%)")).toBeVisible()
    await expect(page.getByText("Reduced rate (12%)")).toBeVisible()
    await expect(page.getByText("Base: $100.00 · VAT: $21.00")).toBeVisible()
    await expect(page.getByText("Base: $100.00 · VAT: $12.00")).toBeVisible()
  })
})

test("changing a catalog item's tax rate does not retroactively change an already-added bill line", async ({
  seededPage: page,
}) => {
  await test.step("create two tax rates and an item using the first", async () => {
    await addTaxRate(page, "en", { name: "Standard rate", rate: "21" })
    await addTaxRate(page, "en", { name: "Reduced rate", rate: "12" })
    // 121.00 at 21% inclusive splits into base 100.00 + VAT 21.00.
    await addCatalogItem(page, "en", {
      name: "Coffee",
      price: "121",
      taxRateName: "Standard rate",
    })
  })

  let billId = ""

  await test.step("add the item to a bill once", async () => {
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
    billId = new URL(page.url()).searchParams.get("billId") ?? ""
    // A single brick click here (vs. two in a row in the previous test)
    // leaves less natural elapsed time before the next hard navigation, so
    // one settle wait isn't consistently enough.
    await waitForLocalWriteToSettle(page)
    await waitForLocalWriteToSettle(page)
  })

  await test.step("the bill shows the original rate", async () => {
    await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")
    await expect(page.getByText("Standard rate (21%)")).toBeVisible()
    await expect(page.getByText("Base: $100.00 · VAT: $21.00")).toBeVisible()
  })

  await test.step("change the item's tax rate in settings", async () => {
    await gotoPage(page, "/settings/items", "en", "settings.items.title")
    await page.getByRole("link", { name: /Coffee/ }).click()
    await page
      .getByRole("combobox", {
        name: translate("en", "settings.items.form.taxRate.label"),
      })
      .click()
    await page.getByRole("option", { name: /Reduced rate/ }).click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.items.form.save.edit"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.items.form.saved.edit"))
      .waitFor()
  })

  await test.step("the already-added line still shows the original rate", async () => {
    await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")
    await expect(page.getByText("Standard rate (21%)")).toBeVisible()
    await expect(page.getByText("Base: $100.00 · VAT: $21.00")).toBeVisible()
    await expect(page.getByText(/Reduced rate/)).not.toBeVisible()
  })

  await test.step("adding the item again picks up the new rate as a separate line", async () => {
    await page
      .getByRole("button", { name: translate("en", "billDetail.backToBill") })
      .click()
    await page
      .getByRole("button", { name: nameParam("bill.brick.add.aria", "Coffee") })
      .click()
    await waitForLocalWriteToSettle(page)

    await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")
    await expect(page.getByText("Standard rate (21%)")).toBeVisible()
    await expect(page.getByText("Reduced rate (12%)")).toBeVisible()
  })
})

test("no VAT breakdown appears when no item has a tax rate", async ({
  seededPage: page,
}) => {
  await addCatalogItem(page, "en", { name: "Coffee", price: "5" })

  await test.step("start a bill with the untaxed item", async () => {
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
  })

  await test.step("the bill detail shows no VAT breakdown", async () => {
    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .not.toBeNull()
    const billId = new URL(page.url()).searchParams.get("billId") ?? ""
    await gotoPage(page, `/activity/bills/${billId}`, "en", "billDetail.title")
    await expect(
      page.getByText(translate("en", "taxRecap.title"))
    ).not.toBeVisible()
  })
})
