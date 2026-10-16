import { addTable } from "./support/bill.ts"
import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import { gotoPage, reloadPage } from "./support/navigation.ts"

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

  const nameInput = page.getByRole("textbox", {
    name: translate("en", "settings.tables.form.name.label"),
  })
  const seatCountInput = page.getByRole("textbox", {
    name: translate("en", "settings.tables.form.seatCount.label"),
  })
  const saveButton = page.getByRole("button", {
    name: translate("en", "inlineEdit.save"),
  })

  await test.step("edit the table and see a generated code", async () => {
    await tableRow.click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.tables.form.title.edit"),
      })
      .waitFor()

    await expect(nameInput).toHaveValue("Patio 1")

    const codeInput = page.getByRole("textbox", {
      name: translate("en", "settings.tables.form.code.label"),
    })
    await expect(codeInput).toHaveValue(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/
    )
    await expect(codeInput).toBeDisabled()

    // Each field saves itself; there is no submit button.
    await nameInput.fill("Patio 2")
    await nameInput.press("Enter")
  })

  await test.step("an edit holds focus until it is finished", async () => {
    await seatCountInput.fill("6")

    // Clicking away is refused: focus stays put and nothing is saved yet.
    await nameInput.click()
    await expect(seatCountInput).toBeFocused()

    await saveButton.click()
    await expect(saveButton).toBeHidden()

    const savedTick = page.getByLabel(translate("en", "inlineEdit.saved"))
    await expect(savedTick).toBeVisible()
    // It fades back out on its own.
    await expect(savedTick).toHaveCount(0, { timeout: 5_000 })
  })

  await test.step("an invalid value is rejected and can be discarded", async () => {
    const seatCountError = page.getByText(
      translate("en", "settings.tables.form.seatCount.invalid")
    )
    await seatCountInput.fill("0")

    // A refused click away says why, rather than only blinking.
    await nameInput.click()
    await expect(seatCountError).toBeVisible()
    await expect(seatCountInput).toBeFocused()

    await saveButton.click()
    await expect(seatCountError).toBeVisible()

    // Escape drops the draft and the field falls back to the stored value.
    await seatCountInput.press("Escape")
    await expect(seatCountInput).toHaveValue("6")
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
