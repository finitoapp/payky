import {
  addCatalogItem,
  enterBillScanMode,
  expect,
  gotoPage,
  injectScanCode,
  startNewBill,
  test,
  translate,
  translateValue,
} from "./fixtures.ts"

test("scan mode adds a known item, flags a code collision, and reports an unknown code", async ({
  seededPage: page,
}) => {
  await test.step("seed items, two of them sharing one scan code", async () => {
    await addCatalogItem(page, "en", {
      name: "Coffee",
      price: "5",
      scanCode: "1111",
    })
    await addCatalogItem(page, "en", {
      name: "Tea",
      price: "3",
      scanCode: "2222",
    })
    await addCatalogItem(page, "en", {
      name: "Cocoa",
      price: "4",
      scanCode: "2222",
    })
  })

  await test.step("open a fresh cart in scan mode", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
    await enterBillScanMode(page, "en")
  })

  const summaryTrigger = page.getByTestId("bill-summary-trigger")
  const summaryPanel = page.getByTestId("bill-summary-panel")

  await test.step("a code matching exactly one item adds it directly", async () => {
    await injectScanCode(page, "1111")
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 1)
    )
    await summaryTrigger.click()
    await expect(summaryPanel.getByText("Coffee")).toBeVisible()
  })

  await test.step("a code matching more than one item opens a collision dialog", async () => {
    await injectScanCode(page, "2222")
    await expect(
      page.getByText(translate("en", "bill.scan.collision.title"))
    ).toBeVisible()
    await page.getByRole("button", { name: /^Tea/ }).click()
    await expect(
      page.getByText(translate("en", "bill.scan.collision.title"))
    ).not.toBeVisible()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 2)
    )
    await expect(summaryPanel.getByText("Tea")).toBeVisible()
    await expect(summaryPanel.getByText("Cocoa")).not.toBeVisible()
  })

  await test.step("an unrecognized code reports itself as unknown without adding anything", async () => {
    await injectScanCode(page, "9999")
    const cancelButton = page.getByRole("button", {
      name: translate("en", "bill.scan.unknown.cancel"),
    })
    await expect(cancelButton).toBeVisible()
    await cancelButton.click()
    await expect(cancelButton).not.toBeVisible()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 2)
    )
  })
})

test("scanning an unknown code can create a new catalog item and add it to the cart", async ({
  seededPage: page,
}) => {
  await test.step("open a fresh cart in scan mode", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
    await enterBillScanMode(page, "en")
  })

  await test.step("an unknown code offers to add a new item", async () => {
    await injectScanCode(page, "3333")
    await page
      .getByRole("button", {
        name: translate("en", "bill.scan.unknown.create"),
      })
      .click()
  })

  await test.step("fill and save the quick-create form", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.name.label"),
      })
      .fill("Muffin")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.price.label"),
      })
      .fill("2.5")
    await page
      .getByRole("button", { name: translate("en", "bill.scan.create.save") })
      .click()
  })

  await test.step("the new item is added to the cart", async () => {
    const summaryTrigger = page.getByTestId("bill-summary-trigger")
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 1)
    )
    await summaryTrigger.click()
    await expect(
      page.getByTestId("bill-summary-panel").getByText("Muffin")
    ).toBeVisible()
  })

  await test.step("the new item was also saved to the catalog with its scan code", async () => {
    await gotoPage(page, "/settings/items", "en", "settings.items.title")
    await page.getByRole("link", { name: "Muffin" }).click()
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.items.form.scanCode.label"),
      })
    ).toHaveValue("3333")
  })
})
