import { expect, gotoPage, test, translate } from "./fixtures.ts"

test("browse about, privacy, and terms pages", async ({ seededPage: page }) => {
  await test.step("open the about page", async () => {
    await gotoPage(page, "/settings/about", "en", "settings.about.title")
    await expect(
      page.getByText(translate("en", "settings.appVersion"))
    ).toBeVisible()
  })

  await test.step("open the privacy policy", async () => {
    await page
      .getByRole("link", {
        name: translate("en", "settings.about.privacy.title"),
      })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.about.privacy.title"),
      })
      .waitFor()
    await expect(
      page.getByText(translate("en", "settings.about.privacy.heading"))
    ).toBeVisible()
  })

  await test.step("go back and open the terms of service", async () => {
    await page.goBack()
    await page
      .getByRole("link", {
        name: translate("en", "settings.about.terms.title"),
      })
      .click()
    await page
      .getByRole("heading", {
        name: translate("en", "settings.about.terms.title"),
      })
      .waitFor()
    await expect(
      page.getByText(translate("en", "settings.about.terms.heading"))
    ).toBeVisible()
  })
})
