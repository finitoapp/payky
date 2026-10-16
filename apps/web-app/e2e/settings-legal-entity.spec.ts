import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import {
  pickInlineOption,
  toggleInlineCheckbox,
} from "./support/inline-edit.ts"
import { gotoPage, reloadPage } from "./support/navigation.ts"

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

  await test.step("the VAT-payer choice waits for a country", async () => {
    // Saving it first would write country "other" on the user's behalf, so
    // the checkbox stays disabled until the country is chosen — which is
    // what the old form's "country required" error existed to prevent.
    await expect(
      page.getByRole("checkbox", {
        name: translate("en", "settings.legalEntity.vatPayer.label"),
      })
    ).toBeDisabled()
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
    await pickInlineOption(
      page,
      "settings.legalEntity.country.label",
      translate("en", "country.sk")
    )
    await toggleInlineCheckbox(page, "settings.legalEntity.vatPayer.label")
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
    await pickInlineOption(
      page,
      "settings.legalEntity.country.label",
      translate("en", "country.other")
    )
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
