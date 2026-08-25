import { expect, gotoPage, reloadPage, test, translate } from "./fixtures.ts"

test("create, edit and delete a catalog category", async ({
  seededPage: page,
}) => {
  await test.step("open category settings and see the empty state", () =>
    gotoPage(page, "/settings/categories", "en", "settings.categories.title"))

  await expect(
    page.getByText(translate("en", "settings.categories.empty.title"))
  ).toBeVisible()

  await test.step("go to the add category form", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.categories.add"),
      })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.categories.form.title.create"),
      })
      .waitFor()
  })

  await test.step("fill in and save a new category", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.categories.form.name.label"),
      })
      .fill("Drinks")
    await page
      .getByRole("button", {
        name: translate("en", "settings.categories.form.save.create"),
      })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.categories.title"),
      })
      .waitFor()
  })

  const categoryRow = page.getByRole("link", { name: "Drinks" })

  await test.step("verify the category appears in the list", async () => {
    await expect(categoryRow).toBeVisible()
  })

  await test.step("edit the category's name", async () => {
    await categoryRow.click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.categories.form.title.edit"),
      })
      .waitFor()

    const nameInput = page.getByRole("textbox", {
      name: translate("en", "settings.categories.form.name.label"),
    })
    await expect(nameInput).toHaveValue("Drinks")

    await nameInput.fill("Beverages")
    await page
      .getByRole("button", {
        name: translate("en", "settings.categories.form.save.edit"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.categories.form.saved.edit"))
      .waitFor()
  })

  await test.step("verify the edit persists after reload", async () => {
    await reloadPage(page, "en", "settings.categories.form.title.edit")
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.categories.form.name.label"),
      })
    ).toHaveValue("Beverages")
  })

  await test.step("delete the category and confirm", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.categories.delete"),
      })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.categories.delete.confirm.confirm"),
      })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.categories.title"),
      })
      .waitFor()
  })

  await test.step("verify the list is empty again", async () => {
    await expect(
      page.getByText(translate("en", "settings.categories.empty.title"))
    ).toBeVisible()
  })
})

test("assign a category to an item from the item form", async ({
  seededPage: page,
}) => {
  await test.step("create a category", async () => {
    await gotoPage(
      page,
      "/settings/categories",
      "en",
      "settings.categories.title"
    )
    await page
      .getByRole("button", {
        name: translate("en", "settings.categories.add"),
      })
      .click()
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.categories.form.name.label"),
      })
      .fill("Drinks")
    await page
      .getByRole("button", {
        name: translate("en", "settings.categories.form.save.create"),
      })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.categories.title"),
      })
      .waitFor()
  })

  await test.step("create an item and assign the category", async () => {
    await gotoPage(page, "/settings/items", "en", "settings.items.title")
    await page
      .getByRole("button", { name: translate("en", "settings.items.add") })
      .click()
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.name.label"),
      })
      .fill("Coffee")
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.items.form.price.label"),
      })
      .fill("59")
    await page
      .getByRole("combobox", {
        name: translate("en", "settings.items.form.category.label"),
      })
      .click()
    await page.getByRole("option", { name: "Drinks" }).click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.items.form.save.create"),
      })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "settings.items.title") })
      .waitFor()
  })

  await test.step("verify the category name shows under the item", async () => {
    const itemRow = page.getByRole("link", { name: /Coffee/ })
    await expect(itemRow).toContainText("Drinks")
  })
})
