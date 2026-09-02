import {
  addCatalogCategory,
  addCatalogItem,
  addTable,
  expect,
  gotoPage,
  gotoPosOverview,
  markCashPaid,
  startNewBill,
  test,
  translate,
  translateValue,
} from "./fixtures.ts"

const nameParam = (key: Parameters<typeof translate>[1], name: string) =>
  translate("en", key).replace("{name}", name)

test("build a cart, save it, resume it, and discard it", async ({
  seededPage: page,
}) => {
  await test.step("add a catalog item", () =>
    addCatalogItem(page, "en", { name: "Coffee", price: "5" }))

  await test.step("open the cart from the home icon", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
  })

  const addCoffee = page.getByRole("button", {
    name: nameParam("bill.brick.add.aria", "Coffee"),
  })
  const removeCoffee = page.getByRole("button", {
    name: nameParam("bill.brick.remove.aria", "Coffee"),
  })
  const summaryTrigger = page.getByTestId("bill-summary-trigger")

  await test.step("search filters the item grid", async () => {
    const searchInput = page.getByRole("textbox", {
      name: translate("en", "bill.search"),
    })
    await searchInput.fill("nonexistent")
    await expect(
      page.getByText(translate("en", "bill.emptySearch"))
    ).toBeVisible()
    await searchInput.fill("")
    await expect(addCoffee).toBeVisible()
  })

  await test.step("adding and removing items updates the summary", async () => {
    await addCoffee.click()
    await addCoffee.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 2)
    )
    await removeCoffee.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 1)
    )
  })

  const summaryPanel = page.getByTestId("bill-summary-panel")

  await test.step("expand the summary and undo/redo/clear", async () => {
    await summaryTrigger.click()
    await expect(summaryPanel.getByText("Coffee")).toBeVisible()

    // Scoped to the summary panel: a clear/remove below also raises an
    // undo toast whose action button shares this same accessible name.
    const undoButton = summaryPanel.getByRole("button", {
      name: translate("en", "bill.summary.undo"),
    })
    const redoButton = summaryPanel.getByRole("button", {
      name: translate("en", "bill.summary.redo"),
    })
    const clearButton = summaryPanel.getByRole("button", {
      name: translate("en", "bill.summary.clear"),
    })

    // Last action was "remove one" (quantity 1 -> 2 on undo).
    await undoButton.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 2)
    )
    await redoButton.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 1)
    )

    await clearButton.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 0)
    )
    await undoButton.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 1)
    )
  })

  await test.step("closing the bill returns to the bills list, where the saved cart appears", async () => {
    await page
      .getByRole("button", { name: translate("en", "nav.back") })
      .click()
    await page.getByTestId("no-table-tile").waitFor()
    const unassignedBillRow = page
      .getByTestId("no-table-tile")
      .getByRole("link", { name: /^Bill #/ })
    await expect(unassignedBillRow).toHaveCount(1)

    await unassignedBillRow.click()
    await page.getByRole("heading", { name: /^Bill #/ }).waitFor()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 1)
    )
  })

  await test.step("discard the resumed cart with confirmation", async () => {
    const discardButton = page.getByRole("button", {
      name: translate("en", "bill.discard"),
    })
    await discardButton.click()
    await page
      .getByRole("button", {
        name: translate("en", "bill.discard.confirm.confirm"),
      })
      .click()
    await expect(page.getByTestId("no-table-tile")).toContainText(
      translate("en", "tables.tile.free")
    )
  })
})

test("discards a resumed cart from the bill page", async ({
  seededPage: page,
}) => {
  await test.step("create an item and save it in a cart", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
    await page
      .getByRole("button", {
        name: nameParam("bill.brick.add.aria", "Coffee"),
      })
      .click()
    // Wait for the lazily-created bill's own navigation (replacing the URL
    // with its billId) to land before closing, so it can't race the back
    // navigation and leave the router on neither URL.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .not.toBeNull()
    await page
      .getByRole("button", { name: translate("en", "nav.back") })
      .click()
    await page.getByTestId("no-table-tile").waitFor()
  })

  await test.step("resume the saved cart", async () => {
    await page
      .getByTestId("no-table-tile")
      .getByRole("link", { name: /^Bill #/ })
      .click()
    await page.getByRole("heading", { name: /^Bill #/ }).waitFor()
  })

  await test.step("discard it via the discard button", async () => {
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

  await test.step("the cart no longer appears in the saved carts list", async () => {
    await expect(page.getByTestId("no-table-tile")).toContainText(
      translate("en", "tables.tile.free")
    )
  })
})

test("shows the right message for a closed or missing bill", async ({
  seededPage: page,
}) => {
  let billId: string | null = null

  await test.step("create a cart and charge it with cash", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
    await page
      .getByRole("button", {
        name: nameParam("bill.brick.add.aria", "Coffee"),
      })
      .click()

    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .not.toBeNull()
    billId = new URL(page.url()).searchParams.get("billId")

    await page
      .getByRole("button", { name: translate("en", "home.pay") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentTip.none") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentTip.continue") })
      .click()
    await markCashPaid(page, "en")

    // Return to the terminal through the in-app link (client-side route,
    // no full page reload) rather than an immediate page.goto: closing the
    // bill after cash payment is a fire-and-forget write kicked off by this
    // same screen, and a hard navigation right away would tear down the
    // page before that write lands.
    await page
      .getByRole("button", { name: translate("en", "paymentWait.back") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "nav.numpad") })
      .waitFor()
  })

  await test.step("the closed bill shows the closed message", async () => {
    await page.goto(`/bill?billId=${billId}`, {
      waitUntil: "domcontentloaded",
    })
    await page.getByRole("heading", { name: /^Bill #/ }).waitFor()
    await expect(page.getByText(translate("en", "bill.closed"))).toBeVisible()
  })

  await test.step("a missing bill shows the not-found message", async () => {
    // A well-formed but never-issued id: real ids encode trailing padding
    // bits in their last character, so only the first character of a known
    // valid id is swapped, keeping the rest (and its encoding) untouched.
    const missingBillId = `${billId?.[0] === "a" ? "b" : "a"}${billId?.slice(1)}`
    await page.goto(`/bill?billId=${missingBillId}`, {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByRole("heading", { name: translate("en", "bill.title") })
      .waitFor()
    await expect(page.getByText(translate("en", "bill.notFound"))).toBeVisible()
  })
})

test("decrements a saved item after its catalog snapshot changes", async ({
  seededPage: page,
}) => {
  await test.step("create an item and save it in a cart", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
    await page
      .getByRole("button", {
        name: nameParam("bill.brick.add.aria", "Coffee"),
      })
      .click()
    await expect(page.getByTestId("bill-summary-trigger")).toContainText(
      translateValue("en", "bill.itemsCount", 1)
    )
    await page
      .getByRole("button", { name: translate("en", "nav.back") })
      .click()
  })

  await test.step("edit the catalog price", async () => {
    await gotoPage(page, "/settings/items", "en", "settings.items.title")
    await page.getByRole("link", { name: "Coffee" }).click()
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.price.label"),
      })
      .fill("6")
    await page
      .getByRole("button", {
        name: translate("en", "settings.items.form.save.edit"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.items.form.saved.edit"))
      .waitFor()
  })

  await test.step("resume the cart and remove its old snapshot", async () => {
    await gotoPosOverview(page, "en")
    await page
      .getByTestId("no-table-tile")
      .getByRole("link", { name: /^Bill #/ })
      .click()
    await page
      .getByRole("button", {
        name: nameParam("bill.brick.remove.aria", "Coffee"),
      })
      .click()
    await expect(page.getByTestId("bill-summary-trigger")).toContainText(
      translateValue("en", "bill.itemsCount", 0)
    )
  })
})

test("charges a cart and closes it once cash is paid", async ({
  seededPage: page,
}) => {
  await test.step("add a cart item and open payment", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
    await page
      .getByRole("button", {
        name: nameParam("bill.brick.add.aria", "Coffee"),
      })
      .click()

    const chargeButton = page.getByRole("button", {
      name: translate("en", "home.pay"),
    })
    await expect(chargeButton).toBeInViewport()
    await chargeButton.click()
    await page
      .getByRole("heading", { name: translate("en", "paymentTip.title") })
      .waitFor()
    expect(new URL(page.url()).searchParams.get("billId")).not.toBeNull()
    await expect(page.locator("h1")).toHaveText("$5.00")
  })

  await test.step("continue with no tip and mark cash paid", async () => {
    await page
      .getByRole("button", { name: translate("en", "paymentTip.none") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentTip.continue") })
      .click()
    await markCashPaid(page, "en")

    // Return to the terminal through the in-app link (client-side route,
    // no full page reload) rather than an immediate page.goto: closing the
    // bill after cash payment is a fire-and-forget write kicked off by this
    // same screen, and a hard navigation right away would tear down the
    // page before that write lands.
    await page
      .getByRole("button", { name: translate("en", "paymentWait.back") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "nav.numpad") })
      .waitFor()
  })

  await test.step("verify the paid bill is no longer resumable", async () => {
    await gotoPosOverview(page, "en")
    await expect(page.getByTestId("no-table-tile")).toContainText(
      translate("en", "tables.tile.free")
    )
  })
})

test("locks a bill while its payment is pending, and unlocks it once that payment is canceled", async ({
  seededPage: page,
}) => {
  let billId: string | null = null
  let paymentPageUrl = ""

  await test.step("add a cart item and start a payment", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
    await page
      .getByRole("button", {
        name: nameParam("bill.brick.add.aria", "Coffee"),
      })
      .click()

    const chargeButton = page.getByRole("button", {
      name: translate("en", "home.pay"),
    })
    await expect(chargeButton).toBeInViewport()
    await chargeButton.click()
    await page
      .getByRole("heading", { name: translate("en", "paymentTip.title") })
      .waitFor()
    billId = new URL(page.url()).searchParams.get("billId")
    expect(billId).not.toBeNull()

    await page
      .getByRole("button", { name: translate("en", "paymentTip.none") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentTip.continue") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentWait.cancel") })
      .waitFor()
    paymentPageUrl = page.url()
  })

  await test.step("the bill shows as locked while the payment is pending", async () => {
    await page.goto(`/bill?billId=${billId}`, {
      waitUntil: "domcontentloaded",
    })
    await page.getByRole("heading", { name: /^Bill #/ }).waitFor()
    await expect(page.getByText(translate("en", "bill.locked"))).toBeVisible()

    const viewPaymentButton = page.getByRole("button", {
      name: translate("en", "bill.locked.viewPayment"),
    })
    await expect(viewPaymentButton).toBeVisible()
    await viewPaymentButton.click()
    await page
      .getByRole("button", { name: translate("en", "paymentWait.cancel") })
      .waitFor()
    expect(page.url()).toBe(paymentPageUrl)

    await page.goto(`/bill?billId=${billId}`, {
      waitUntil: "domcontentloaded",
    })
  })

  await test.step("canceling the payment unlocks the bill again", async () => {
    await page.goto(paymentPageUrl, { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", { name: translate("en", "paymentWait.cancel") })
      .click()

    // The cancel handler navigates back to the bill itself since this
    // payment has a billId.
    await page.getByRole("heading", { name: /^Bill #/ }).waitFor()
    await expect(
      page.getByText(translate("en", "bill.locked"))
    ).not.toBeVisible()
    await expect(
      page.getByRole("button", {
        name: nameParam("bill.brick.add.aria", "Coffee"),
      })
    ).toBeVisible()
  })

  await test.step("the canceled payment's own page shows it as canceled, not paid", async () => {
    await page.goto(paymentPageUrl, { waitUntil: "domcontentloaded" })
    await expect(
      page.getByText(translate("en", "paymentWait.canceled"))
    ).toBeVisible()
    // The success ("paid") panel must not render at all for a canceled
    // payment — `isPaid` is now derived from `derivePaymentStatus`, which
    // ranks `canceled` above `paid` even though a claim could in principle
    // still exist. See docs/bill-payment-states.md.
    await expect(page.getByTestId("payment-paid-panel")).toHaveCount(0)
  })
})

test("adds a bulk quantity through the quantity dialog", async ({
  seededPage: page,
}) => {
  await test.step("add a catalog item and open the cart", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
  })

  const summaryTrigger = page.getByTestId("bill-summary-trigger")
  const quantityTrigger = page.getByRole("button", {
    name: nameParam("bill.brick.quantity.trigger.aria", "Coffee"),
  })

  await test.step("cancelling the dialog leaves the cart untouched", async () => {
    await quantityTrigger.click()
    await page
      .getByRole("dialog", { name: "Coffee" })
      .getByRole("textbox", {
        name: translate("en", "bill.brick.quantity.input.aria"),
      })
      .fill("7")
    await page
      .getByRole("button", {
        name: translate("en", "bill.brick.quantity.cancel"),
      })
      .click()
    await expect(page.getByRole("dialog", { name: "Coffee" })).not.toBeVisible()
    await expect(quantityTrigger).toContainText("0")
  })

  await test.step("confirming adds the whole quantity in one go", async () => {
    await quantityTrigger.click()
    const dialog = page.getByRole("dialog", { name: "Coffee" })
    await dialog
      .getByRole("textbox", {
        name: translate("en", "bill.brick.quantity.input.aria"),
      })
      .fill("12")
    await dialog
      .getByRole("button", {
        name: translate("en", "bill.brick.quantity.confirm"),
      })
      .click()
    await expect(dialog).not.toBeVisible()
    await expect(quantityTrigger).toContainText("12")
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 12)
    )
  })

  await test.step("reopening the dialog is prefilled with the current quantity", async () => {
    await quantityTrigger.click()
    await expect(
      page.getByRole("dialog", { name: "Coffee" }).getByRole("textbox", {
        name: translate("en", "bill.brick.quantity.input.aria"),
      })
    ).toHaveValue("12")
  })
})

test("filters the item grid by category", async ({ seededPage: page }) => {
  await test.step("create a category and items in and out of it", async () => {
    await addCatalogCategory(page, "en", "Drinks")
    await addCatalogItem(page, "en", {
      name: "Coffee",
      price: "5",
      categoryName: "Drinks",
    })
    await addCatalogItem(page, "en", { name: "Sandwich", price: "6" })
  })

  await test.step("open the bill", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
  })

  const coffeeCard = page.getByText("Coffee", { exact: true })
  const sandwichCard = page.getByText("Sandwich", { exact: true })

  await test.step("both items are visible with the 'all' filter", async () => {
    await expect(coffeeCard).toBeVisible()
    await expect(sandwichCard).toBeVisible()
  })

  await test.step("the 'Drinks' filter only shows the categorized item", async () => {
    await page.getByRole("button", { name: "Drinks" }).click()
    await expect(coffeeCard).toBeVisible()
    await expect(sandwichCard).not.toBeVisible()
  })

  await test.step("the 'Uncategorized' filter only shows the other item", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "bill.category.uncategorized"),
      })
      .click()
    await expect(sandwichCard).toBeVisible()
    await expect(coffeeCard).not.toBeVisible()
  })

  await test.step("the 'All' filter shows both items again", async () => {
    await page
      .getByRole("button", { name: translate("en", "bill.category.all") })
      .click()
    await expect(coffeeCard).toBeVisible()
    await expect(sandwichCard).toBeVisible()
  })
})

test("assigns and clears a table on a cart from the bill header", async ({
  seededPage: page,
}) => {
  await test.step("seed a table and a catalog item", async () => {
    await addTable(page, "en", { name: "Patio 1", seatCount: "4" })
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  })

  await test.step("open the bill", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
  })

  const tableButton = page.getByRole("button", {
    name: translate("en", "bill.table.aria"),
  })

  await test.step("assign the table before the cart has a bill yet", async () => {
    await tableButton.click()
    const dialog = page.getByRole("dialog", {
      name: translate("en", "bill.table.dialog.title"),
    })
    await dialog.getByRole("button", { name: "Patio 1" }).click()
    await expect(dialog).not.toBeVisible()
    await expect(tableButton).toContainText("Patio 1")
  })

  await test.step("the lazily created bill keeps the assigned table", async () => {
    await page
      .getByRole("button", {
        name: nameParam("bill.brick.add.aria", "Coffee"),
      })
      .click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .not.toBeNull()
    await expect(tableButton).toContainText("Patio 1")
  })

  await test.step("the POS overview shows the bill inside Patio 1's tile", async () => {
    await gotoPosOverview(page, "en")
    const patioTile = page
      .getByTestId("table-tile")
      .filter({ hasText: "Patio 1" })
    await expect(patioTile.getByRole("link", { name: /^Bill #/ })).toHaveCount(
      1
    )
  })

  await test.step("clear the table assignment", async () => {
    await page.goBack()
    await page.getByRole("heading", { name: /^Bill #/ }).waitFor()
    await tableButton.click()
    const dialog = page.getByRole("dialog", {
      name: translate("en", "bill.table.dialog.title"),
    })
    await dialog
      .getByRole("button", {
        name: translate("en", "bill.table.dialog.none"),
      })
      .click()
    await expect(dialog).not.toBeVisible()
    await expect(tableButton).toContainText(
      translate("en", "bill.table.assign")
    )
  })
})
