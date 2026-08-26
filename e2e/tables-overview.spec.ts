import {
  addCatalogItem,
  addTable,
  expect,
  gotoPage,
  test,
  translate,
  translateValue,
} from "./fixtures.ts"

const nameParam = (key: Parameters<typeof translate>[1], name: string) =>
  translate("en", key).replace("{name}", name)

test("shows a free table, starts a cart from it, then shows it occupied", async ({
  seededPage: page,
}) => {
  await test.step("seed a table and a catalog item", async () => {
    await addTable(page, "en", { name: "Table A", seatCount: "2" })
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  })

  const tableTile = page.getByRole("link", { name: /Table A/ })
  let billId: string | null = null

  await test.step("open the tables overview and see the table is free", async () => {
    await gotoPage(page, "/tables", "en", "tables.title")
    await expect(tableTile).toBeVisible()
    await expect(tableTile).toContainText(translate("en", "tables.tile.free"))
  })

  await test.step("tap the free table and add an item", async () => {
    await tableTile.click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()
    await page
      .getByRole("button", {
        name: nameParam("checkout.brick.add.aria", "Coffee"),
      })
      .click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .not.toBeNull()
    billId = new URL(page.url()).searchParams.get("billId")
    await expect(
      page.getByRole("button", { name: translate("en", "checkout.table.aria") })
    ).toContainText("Table A")
  })

  await test.step("back on the overview, the table now shows as occupied", async () => {
    await gotoPage(page, "/tables", "en", "tables.title")
    await expect(tableTile).toBeVisible()
    await expect(tableTile).not.toContainText(
      translate("en", "tables.tile.free")
    )
    await expect(tableTile).toContainText(
      translateValue("en", "checkout.itemsCount", 1)
    )
  })

  await test.step("tapping the occupied table resumes its cart", async () => {
    await tableTile.click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .toBe(billId)
  })
})

test("shows an empty state when there are no tables yet", async ({
  seededPage: page,
}) => {
  await gotoPage(page, "/tables", "en", "tables.title")
  await expect(
    page.getByText(translate("en", "tables.empty.title"))
  ).toBeVisible()
})

test("a table with multiple open carts links to the saved carts list pre-filtered to it", async ({
  seededPage: page,
}) => {
  const billLabel = (number: number) =>
    translate("en", "checkout.bills.label").replace("{number}", String(number))

  const parkCart = async (tableName: string | null) => {
    // A client-side nav click, not gotoPage/page.goto: this runs several
    // times in a row and a hard reload re-inits Evolu's OPFS SQLite WASM
    // each time, which gets slow enough after a few carts to time out.
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.title") })
      .waitFor()

    if (tableName !== null) {
      await page
        .getByRole("button", { name: translate("en", "checkout.table.aria") })
        .click()
      const dialog = page.getByRole("dialog", {
        name: translate("en", "checkout.table.dialog.title"),
      })
      await dialog.getByRole("button", { name: tableName }).click()
      await expect(dialog).not.toBeVisible()
    }

    await page
      .getByRole("button", {
        name: nameParam("checkout.brick.add.aria", "Coffee"),
      })
      .click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("billId"))
      .not.toBeNull()
    await page
      .getByRole("button", {
        name: translate("en", "checkout.park"),
        exact: true,
      })
      .click()
    await page.waitForURL("/")
  }

  await test.step("seed two tables and a catalog item", async () => {
    await addTable(page, "en", { name: "Table B", seatCount: "2" })
    await addTable(page, "en", { name: "Table C", seatCount: "2" })
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
  })

  await test.step("return to the home screen", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", { name: translate("en", "nav.checkout") })
      .waitFor()
  })

  await test.step("park two carts on Table B, one on Table C, and one unassigned", async () => {
    await parkCart("Table B")
    await parkCart("Table B")
    await parkCart("Table C")
    await parkCart(null)
  })

  const tableBTile = page.getByRole("link", { name: /Table B/ })
  const tableCTile = page.getByRole("link", { name: /Table C/ })

  await test.step("Table B's tile shows the open cart count, Table C's shows its single cart", async () => {
    await page
      .getByRole("button", { name: translate("en", "nav.tables") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "tables.title") })
      .waitFor()
    await expect(tableBTile).toContainText(
      translateValue("en", "tables.tile.multipleBills", 2)
    )
    await expect(tableCTile).toContainText(
      translateValue("en", "checkout.itemsCount", 1)
    )
  })

  await test.step("tapping Table B opens the saved carts list pre-filtered to it", async () => {
    await tableBTile.click()
    await page
      .getByRole("heading", { name: translate("en", "checkout.bills.title") })
      .waitFor()
    await expect(new URL(page.url()).searchParams.get("tableId")).not.toBeNull()

    await expect(page.getByText(billLabel(1))).toBeVisible()
    await expect(page.getByText(billLabel(2))).toBeVisible()
    await expect(page.getByText(billLabel(3))).not.toBeVisible()
    await expect(page.getByText(billLabel(4))).not.toBeVisible()
  })

  await test.step("the table filter chips reflect the pre-selected table", async () => {
    const tableBChip = page.getByRole("button", { name: "Table B" })
    const tableCChip = page.getByRole("button", { name: "Table C" })
    const noTableChip = page.getByRole("button", {
      name: translate("en", "checkout.bills.table.none"),
    })
    await expect(tableBChip).toBeVisible()
    await expect(tableCChip).toBeVisible()
    await expect(noTableChip).toBeVisible()
  })

  await test.step("switching the filter to 'All' shows every saved cart", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "checkout.bills.table.all"),
      })
      .click()
    await expect(page.getByText(billLabel(1))).toBeVisible()
    await expect(page.getByText(billLabel(2))).toBeVisible()
    await expect(page.getByText(billLabel(3))).toBeVisible()
    await expect(page.getByText(billLabel(4))).toBeVisible()
  })

  await test.step("the 'No table' filter shows only the unassigned cart", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "checkout.bills.table.none"),
      })
      .click()
    await expect(page.getByText(billLabel(4))).toBeVisible()
    await expect(page.getByText(billLabel(1))).not.toBeVisible()
    await expect(page.getByText(billLabel(2))).not.toBeVisible()
    await expect(page.getByText(billLabel(3))).not.toBeVisible()
  })
})
