import {
  addCatalogItem,
  expect,
  nameParam,
  startNewBill,
  test,
  translate,
  translateValue,
} from "./fixtures.ts"

test("split selected items off a bill into a newly created bill", async ({
  seededPage: page,
}) => {
  await test.step("add a catalog item", () =>
    addCatalogItem(page, "en", { name: "Coffee", price: "5" }))

  await test.step("start a bill with three coffees", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
    const addCoffee = page.getByRole("button", {
      name: nameParam("bill.brick.add.aria", "Coffee"),
    })
    await addCoffee.click()
    await addCoffee.click()
    await addCoffee.click()
  })

  const summaryTrigger = page.getByTestId("bill-summary-trigger")
  await expect(summaryTrigger).toContainText(
    translateValue("en", "bill.itemsCount", 3)
  )

  await expect
    .poll(() => new URL(page.url()).searchParams.get("billId"))
    .not.toBeNull()
  const sourceBillId = new URL(page.url()).searchParams.get("billId")

  await test.step("split two coffees into a new bill", async () => {
    await page
      .getByRole("button", { name: translate("en", "bill.split.button.aria") })
      .click()
    await expect(
      page.getByText(translate("en", "bill.split.title"))
    ).toBeVisible()

    const increaseCoffee = page.getByRole("button", {
      name: nameParam("bill.split.increase.aria", "Coffee"),
    })
    await increaseCoffee.click()
    await increaseCoffee.click()
    await expect(
      page.getByText(`${translate("en", "bill.split.selectedCount")} 2`, {
        exact: false,
      })
    ).toBeVisible()

    await page
      .getByRole("button", {
        name: translate("en", "bill.split.confirm"),
        exact: true,
      })
      .click()
  })

  await test.step("lands on the new bill with the moved items", async () => {
    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .not.toBe(sourceBillId)
    await page
      .getByRole("heading", { name: translate("en", "bill.title") })
      .waitFor()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 2)
    )
  })

  await test.step("the source bill keeps the one remaining coffee", async () => {
    await page.goto(`/bill?billId=${sourceBillId}`, {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByRole("heading", { name: translate("en", "bill.title") })
      .waitFor()
    await expect(summaryTrigger).toContainText(
      translateValue("en", "bill.itemsCount", 1)
    )
  })
})

test("the split button is disabled on an empty bill", async ({
  seededPage: page,
}) => {
  await test.step("open an empty bill", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await startNewBill(page, "en")
  })

  await expect(
    page.getByRole("button", {
      name: translate("en", "bill.split.button.aria"),
    })
  ).toBeDisabled()
})
