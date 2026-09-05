import { expect, gotoPage, reloadPage, test, translate } from "./fixtures.ts"

test("requires a country before saving, and shows a placeholder for an account that never configured it", async ({
  seededPage: page,
}) => {
  // `seededPage` seeds onboarding through the production bridge, which
  // never calls `setLegalEntity` — so this account has no `legalEntity` row
  // at all, distinct from one that exists with country "other" (`null`).
  await test.step("open legal entity settings and see the placeholder", async () => {
    await gotoPage(
      page,
      "/settings/legal-entity",
      "en",
      "settings.legalEntity.title"
    )
    await expect(
      page.getByRole("combobox", {
        name: translate("en", "settings.legalEntity.country.label"),
      })
    ).toContainText(translate("en", "settings.legalEntity.country.placeholder"))
  })

  await test.step("saving without a country shows a validation error", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.legalEntity.save"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "settings.legalEntity.country.required"))
    ).toBeVisible()
  })
})

test("saves country and VAT-payer status, and persists after reload", async ({
  seededPage: page,
}) => {
  await test.step("open legal entity settings", () =>
    gotoPage(
      page,
      "/settings/legal-entity",
      "en",
      "settings.legalEntity.title"
    ))

  await test.step("choose a country and enable VAT payer", async () => {
    await page
      .getByRole("combobox", {
        name: translate("en", "settings.legalEntity.country.label"),
      })
      .click()
    await page
      .getByRole("option", { name: translate("en", "country.sk") })
      .click()
    await page
      .getByRole("checkbox", {
        name: translate("en", "settings.legalEntity.vatPayer.label"),
      })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.legalEntity.save"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.legalEntity.saved"))
      .waitFor()
  })

  await test.step("both choices persist after a reload", async () => {
    await reloadPage(page, "en", "settings.legalEntity.title")
    await expect(
      page.getByRole("combobox", {
        name: translate("en", "settings.legalEntity.country.label"),
      })
    ).toContainText(translate("en", "country.sk"))
    await expect(
      page.getByRole("checkbox", {
        name: translate("en", "settings.legalEntity.vatPayer.label"),
      })
    ).toBeChecked()
  })
})

test('choosing "Other" is distinct from never having configured a country', async ({
  seededPage: page,
}) => {
  await test.step("choose Other and save", async () => {
    await gotoPage(
      page,
      "/settings/legal-entity",
      "en",
      "settings.legalEntity.title"
    )
    await page
      .getByRole("combobox", {
        name: translate("en", "settings.legalEntity.country.label"),
      })
      .click()
    await page
      .getByRole("option", { name: translate("en", "country.other") })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.legalEntity.save"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.legalEntity.saved"))
      .waitFor()
  })

  await test.step("after reload it shows Other, not the empty placeholder", async () => {
    await reloadPage(page, "en", "settings.legalEntity.title")
    await expect(
      page.getByRole("combobox", {
        name: translate("en", "settings.legalEntity.country.label"),
      })
    ).toContainText(translate("en", "country.other"))
  })
})
