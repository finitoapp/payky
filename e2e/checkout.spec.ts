import {
  addCatalogItem,
  expect,
  gotoPage,
  markCashPaid,
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
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()
  })

  const addCoffee = page.getByRole("button", {
    name: nameParam("checkout.brick.add.aria", "Coffee"),
  })
  const removeCoffee = page.getByRole("button", {
    name: nameParam("checkout.brick.remove.aria", "Coffee"),
  })
  const summaryTrigger = page.getByTestId("checkout-summary-trigger")

  await test.step("search filters the item grid", async () => {
    const searchInput = page.getByRole("textbox", {
      name: translate("en", "checkout.search"),
    })
    await searchInput.fill("nonexistent")
    await expect(
      page.getByText(translate("en", "checkout.emptySearch"))
    ).toBeVisible()
    await searchInput.fill("")
    await expect(addCoffee).toBeVisible()
  })

  await test.step("adding and removing items updates the summary", async () => {
    await addCoffee.click()
    await addCoffee.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "checkout.itemsCount", 2)
    )
    await removeCoffee.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "checkout.itemsCount", 1)
    )
  })

  const summaryPanel = page.getByTestId("checkout-summary-panel")

  await test.step("expand the summary and undo/redo/clear", async () => {
    await summaryTrigger.click()
    await expect(summaryPanel.getByText("Coffee")).toBeVisible()

    // Scoped to the summary panel: a clear/remove below also raises an
    // undo toast whose action button shares this same accessible name.
    const undoButton = summaryPanel.getByRole("button", {
      name: translate("en", "checkout.summary.undo"),
    })
    const redoButton = summaryPanel.getByRole("button", {
      name: translate("en", "checkout.summary.redo"),
    })
    const clearButton = summaryPanel.getByRole("button", {
      name: translate("en", "checkout.summary.clear"),
    })

    // Last action was "remove one" (quantity 1 -> 2 on undo).
    await undoButton.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "checkout.itemsCount", 2)
    )
    await redoButton.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "checkout.itemsCount", 1)
    )

    await clearButton.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "checkout.itemsCount", 0)
    )
    await undoButton.click()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "checkout.itemsCount", 1)
    )
  })

  await test.step("save returns to the home screen", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "checkout.park"),
        exact: true,
      })
      .click()
    await page.waitForURL("/")
  })

  await test.step("the saved cart appears in the open carts list", async () => {
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "checkout.savedCarts.aria"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.bills.title") })
      .waitFor()
    await expect(
      page.getByText(translateValue("en", "checkout.itemsCount", 1))
    ).toBeVisible()

    await page.getByText(translateValue("en", "checkout.itemsCount", 1)).click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "checkout.itemsCount", 1)
    )
  })

  await test.step("discard the resumed cart with confirmation", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "checkout.savedCarts.aria"),
      })
      .click()
    const discardButton = page.getByRole("button", {
      name: translate("en", "checkout.discard"),
    })
    await discardButton.click()
    await page
      .getByRole("button", {
        name: translate("en", "checkout.discard.confirm.confirm"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "checkout.bills.empty.title"))
    ).toBeVisible()
  })
})

test("discards a resumed cart from the checkout page", async ({
  seededPage: page,
}) => {
  await test.step("create an item and save it in a cart", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .click()
    await page
      .getByRole("button", {
        name: nameParam("checkout.brick.add.aria", "Coffee"),
      })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "checkout.park"),
        exact: true,
      })
      .click()
    await page.waitForURL("/")
  })

  await test.step("resume the saved cart", async () => {
    await gotoPage(page, "/checkout/bills", "en", "checkout.bills.title")
    await page.getByText(translateValue("en", "checkout.itemsCount", 1)).click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()
  })

  await test.step("discard it via the discard button", async () => {
    await page
      .getByRole("button", { name: translate("en", "checkout.discard") })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "checkout.discard.confirm.confirm"),
      })
      .click()
    await page.waitForURL("/")
  })

  await test.step("the cart no longer appears in the saved carts list", async () => {
    await gotoPage(page, "/checkout/bills", "en", "checkout.bills.title")
    await expect(
      page.getByText(translate("en", "checkout.bills.empty.title"))
    ).toBeVisible()
  })
})

test("keeps the saved-carts link visible for a closed or missing bill", async ({
  seededPage: page,
}) => {
  let billId: string | null = null

  await test.step("create a cart and charge it with cash", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .click()
    await page
      .getByRole("button", {
        name: nameParam("checkout.brick.add.aria", "Coffee"),
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
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .waitFor()
  })

  await test.step("the closed bill still shows the saved-carts link", async () => {
    await page.goto(`/checkout?billId=${billId}`, {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()
    await expect(
      page.getByText(translate("en", "checkout.bill.closed"))
    ).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: translate("en", "checkout.savedCarts.aria"),
      })
    ).toBeVisible()
  })

  await test.step("a missing bill still shows the saved-carts link", async () => {
    // A well-formed but never-issued id: real ids encode trailing padding
    // bits in their last character, so only the first character of a known
    // valid id is swapped, keeping the rest (and its encoding) untouched.
    const missingBillId = `${billId?.[0] === "a" ? "b" : "a"}${billId?.slice(1)}`
    await page.goto(`/checkout?billId=${missingBillId}`, {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()
    await expect(
      page.getByText(translate("en", "checkout.bill.notFound"))
    ).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: translate("en", "checkout.savedCarts.aria"),
      })
    ).toBeVisible()
  })
})

test("decrements a saved item after its catalog snapshot changes", async ({
  seededPage: page,
}) => {
  await test.step("create an item and save it in a cart", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .click()
    await page
      .getByRole("button", {
        name: nameParam("checkout.brick.add.aria", "Coffee"),
      })
      .click()
    await expect(page.getByTestId("checkout-summary-trigger")).toContainText(
      translateValue("en", "checkout.itemsCount", 1)
    )
    await page
      .getByRole("button", {
        name: translate("en", "checkout.park"),
        exact: true,
      })
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
    await gotoPage(page, "/checkout/bills", "en", "checkout.bills.title")
    await page.getByText(translateValue("en", "checkout.itemsCount", 1)).click()
    await page
      .getByRole("button", {
        name: nameParam("checkout.brick.remove.aria", "Coffee"),
      })
      .click()
    await expect(page.getByTestId("checkout-summary-trigger")).toContainText(
      translateValue("en", "checkout.itemsCount", 0)
    )
  })
})

test("charges a cart and closes it once cash is paid", async ({
  seededPage: page,
}) => {
  await test.step("add a cart item and open payment", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .click()
    await page
      .getByRole("button", {
        name: nameParam("checkout.brick.add.aria", "Coffee"),
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
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .waitFor()
  })

  await test.step("verify the paid bill is no longer resumable", async () => {
    await gotoPage(page, "/checkout/bills", "en", "checkout.bills.title")
    await expect(
      page.getByText(translate("en", "checkout.bills.empty.title"))
    ).toBeVisible()
  })
})

test("adds a bulk quantity through the quantity dialog", async ({
  seededPage: page,
}) => {
  await test.step("add a catalog item and open the cart", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()
  })

  const summaryTrigger = page.getByTestId("checkout-summary-trigger")
  const quantityTrigger = page.getByRole("button", {
    name: nameParam("checkout.brick.quantity.trigger.aria", "Coffee"),
  })

  await test.step("cancelling the dialog leaves the cart untouched", async () => {
    await quantityTrigger.click()
    await page
      .getByRole("dialog", { name: "Coffee" })
      .getByRole("textbox", {
        name: translate("en", "checkout.brick.quantity.input.aria"),
      })
      .fill("7")
    await page
      .getByRole("button", {
        name: translate("en", "checkout.brick.quantity.cancel"),
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
        name: translate("en", "checkout.brick.quantity.input.aria"),
      })
      .fill("12")
    await dialog
      .getByRole("button", {
        name: translate("en", "checkout.brick.quantity.confirm"),
      })
      .click()
    await expect(dialog).not.toBeVisible()
    await expect(quantityTrigger).toContainText("12")
    await expect(summaryTrigger).toContainText(
      translateValue("en", "checkout.itemsCount", 12)
    )
  })

  await test.step("reopening the dialog is prefilled with the current quantity", async () => {
    await quantityTrigger.click()
    await expect(
      page.getByRole("dialog", { name: "Coffee" }).getByRole("textbox", {
        name: translate("en", "checkout.brick.quantity.input.aria"),
      })
    ).toHaveValue("12")
  })
})
