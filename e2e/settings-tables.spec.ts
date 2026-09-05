import {
  addTable,
  expect,
  gotoPage,
  reloadPage,
  test,
  translate,
} from "./fixtures.ts"

test("create, edit and delete a table", async ({ seededPage: page }) => {
  await test.step("open table settings and see the empty state", () =>
    gotoPage(page, "/settings/tables", "en", "settings.tables.title"))

  await expect(
    page.getByText(translate("en", "settings.tables.empty.title"))
  ).toBeVisible()

  await test.step("go to the add table form", async () => {
    await page
      .getByRole("button", { name: translate("en", "settings.tables.add") })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.tables.form.title.create"),
      })
      .waitFor()
  })

  await test.step("fill in and save a new table", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.tables.form.name.label"),
      })
      .fill("Patio 1")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.tables.form.seatCount.label"),
      })
      .fill("4")
    await page
      .getByRole("button", {
        name: translate("en", "settings.tables.form.save.create"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "settings.tables.title") })
      .waitFor()
  })

  const tableRow = page.getByRole("link", { name: /Patio 1/ })

  await test.step("verify the table appears in the list with its seat count", async () => {
    await expect(tableRow).toBeVisible()
    await expect(tableRow).toContainText("4")
  })

  await test.step("edit the table and see a generated code", async () => {
    await tableRow.click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.tables.form.title.edit"),
      })
      .waitFor()

    const nameInput = page.getByRole("textbox", {
      name: translate("en", "settings.tables.form.name.label"),
    })
    await expect(nameInput).toHaveValue("Patio 1")

    const codeInput = page.getByRole("textbox", {
      name: translate("en", "settings.tables.form.code.label"),
    })
    await expect(codeInput).toHaveValue(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/
    )
    await expect(codeInput).toBeDisabled()

    await nameInput.fill("Patio 2")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.tables.form.seatCount.label"),
      })
      .fill("6")
    await page
      .getByRole("button", {
        name: translate("en", "settings.tables.form.save.edit"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.tables.form.saved.edit"))
      .waitFor()
  })

  await test.step("verify the edit persists after reload", async () => {
    await reloadPage(page, "en", "settings.tables.form.title.edit")
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.tables.form.name.label"),
      })
    ).toHaveValue("Patio 2")
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.tables.form.seatCount.label"),
      })
    ).toHaveValue("6")
  })

  await test.step("delete the table and confirm", async () => {
    await page
      .getByRole("button", { name: translate("en", "settings.tables.delete") })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.tables.delete.confirm.confirm"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "settings.tables.title") })
      .waitFor()
  })

  await test.step("verify the list is empty again", async () => {
    await expect(
      page.getByText(translate("en", "settings.tables.empty.title"))
    ).toBeVisible()
  })
})

test("search filters the tables list", async ({ seededPage: page }) => {
  await test.step("add two tables", async () => {
    await addTable(page, "en", { name: "Patio 1", seatCount: "4" })
    await addTable(page, "en", { name: "Patio 2", seatCount: "2" })
  })

  const searchInput = page.getByRole("textbox", {
    name: translate("en", "settings.tables.search"),
  })
  const patio1Row = page.getByRole("link", { name: /Patio 1/ })
  const patio2Row = page.getByRole("link", { name: /Patio 2/ })

  await test.step("typing filters the list to matching tables", async () => {
    await searchInput.fill("Patio 1")
    await expect(patio1Row).toBeVisible()
    await expect(patio2Row).not.toBeVisible()
  })

  await test.step("no match shows the empty-search message", async () => {
    await searchInput.fill("nonexistent")
    await expect(
      page.getByText(translate("en", "settings.tables.emptySearch"))
    ).toBeVisible()
  })

  await test.step("clearing the search restores the full list", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.tables.search.clear.aria"),
      })
      .click()
    await expect(searchInput).toHaveValue("")
    await expect(patio1Row).toBeVisible()
    await expect(patio2Row).toBeVisible()
  })
})
