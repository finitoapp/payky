import {
  addCatalogItem,
  expect,
  gotoPage,
  nameParam,
  reloadPage,
  test,
  translate,
} from "./fixtures.ts"

test("create, edit and delete a catalog item", async ({ seededPage: page }) => {
  await test.step("open item settings and see the empty state", () =>
    gotoPage(page, "/settings/items", "en", "settings.items.title"))

  await expect(
    page.getByText(translate("en", "settings.items.empty.title"))
  ).toBeVisible()

  await test.step("go to the add item form", async () => {
    await page
      .getByRole("button", { name: translate("en", "settings.items.add") })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.items.form.title.create"),
      })
      .waitFor()
  })

  await test.step("fill in and save a new item", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.name.label"),
        exact: true,
      })
      .fill("Coffee")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.price.label"),
      })
      .fill("59")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.scanCode.label"),
      })
      .fill("8594001234567")
    await page
      .getByRole("button", {
        name: translate("en", "settings.items.form.save.create"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "settings.items.title") })
      .waitFor()
  })

  const itemRow = page.getByRole("link", { name: "Coffee" })

  await test.step("verify the item appears in the list", async () => {
    await expect(itemRow).toBeVisible()
    await expect(itemRow).toContainText("59")
  })

  await test.step("edit the item's name and price", async () => {
    await itemRow.click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.items.form.title.edit"),
      })
      .waitFor()

    const nameInput = page.getByRole("textbox", {
      name: translate("en", "settings.items.form.name.label"),
      exact: true,
    })
    await expect(nameInput).toHaveValue("Coffee")

    await nameInput.fill("Espresso")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.price.label"),
      })
      .fill("69")
    await page
      .getByRole("button", {
        name: translate("en", "settings.items.form.save.edit"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.items.form.saved.edit"))
      .waitFor()
  })

  await test.step("verify the edit persists after reload", async () => {
    await reloadPage(page, "en", "settings.items.form.title.edit")
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.items.form.name.label"),
        exact: true,
      })
    ).toHaveValue("Espresso")
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.items.form.scanCode.label"),
      })
    ).toHaveValue("8594001234567")
  })

  await test.step("delete the item and confirm", async () => {
    await page
      .getByRole("button", { name: translate("en", "settings.items.delete") })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.items.delete.confirm.confirm"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "settings.items.title") })
      .waitFor()
  })

  await test.step("verify the list is empty again", async () => {
    await expect(
      page.getByText(translate("en", "settings.items.empty.title"))
    ).toBeVisible()
  })
})

test("search filters the items list", async ({ seededPage: page }) => {
  await test.step("add two items", async () => {
    await addCatalogItem(page, "en", { name: "Coffee", price: "5" })
    await addCatalogItem(page, "en", { name: "Tea", price: "3" })
  })

  const searchInput = page.getByRole("textbox", {
    name: translate("en", "settings.items.search"),
  })
  const coffeeRow = page.getByRole("link", { name: "Coffee" })
  const teaRow = page.getByRole("link", { name: "Tea" })

  await test.step("typing filters the list to matching items", async () => {
    await searchInput.fill("Cof")
    await expect(coffeeRow).toBeVisible()
    await expect(teaRow).not.toBeVisible()
  })

  await test.step("no match shows the empty-search message", async () => {
    await searchInput.fill("nonexistent")
    await expect(
      page.getByText(translate("en", "settings.items.emptySearch"))
    ).toBeVisible()
  })

  await test.step("clearing the search restores the full list", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.items.search.clear.aria"),
      })
      .click()
    await expect(searchInput).toHaveValue("")
    await expect(coffeeRow).toBeVisible()
    await expect(teaRow).toBeVisible()
  })
})

test("shows a non-blocking warning for a duplicate scan code but still saves", async ({
  seededPage: page,
}) => {
  // `scanCode` uniqueness can't be enforced (CRDT/multi-device), so a
  // collision is a heads-up next to the field, not a validation error that
  // blocks saving — see `findCatalogItemsByScanCode`.
  await test.step("seed an item with a scan code", async () => {
    await addCatalogItem(page, "en", {
      name: "Coffee",
      price: "5",
      scanCode: "8594001234567",
    })
  })

  await test.step("start a second item with the same scan code", async () => {
    await page
      .getByRole("button", { name: translate("en", "settings.items.add") })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.items.form.title.create"),
      })
      .waitFor()
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.name.label"),
        exact: true,
      })
      .fill("Cocoa")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.price.label"),
      })
      .fill("4")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.scanCode.label"),
      })
      .fill("8594001234567")
  })

  await test.step("the warning names the other item, and saving still succeeds", async () => {
    await expect(
      page.getByText(
        nameParam("settings.items.form.scanCode.duplicate", "Coffee")
      )
    ).toBeVisible()

    await page
      .getByRole("button", {
        name: translate("en", "settings.items.form.save.create"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "settings.items.title") })
      .waitFor()
  })

  await test.step("both items exist in the list", async () => {
    await expect(page.getByRole("link", { name: "Coffee" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Cocoa" })).toBeVisible()
  })
})
