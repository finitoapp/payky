import { expect, gotoPage, reloadPage, test, translate } from "./fixtures.ts"

test("switch the theme", async ({ seededPage: page }) => {
  await test.step("open theme settings", () =>
    gotoPage(page, "/settings/theme", "en", "settings.theme.title"))

  const darkOption = page.getByRole("button", {
    name: translate("en", "settings.theme.dark.title"),
  })

  await test.step("select dark mode", async () => {
    await darkOption.click()
    await expect(darkOption).toHaveAttribute("aria-pressed", "true")
  })

  await test.step("verify the selection persists after reload", async () => {
    await reloadPage(page, "en", "settings.theme.title")
    await expect(darkOption).toHaveAttribute("aria-pressed", "true")
  })
})

test("switch the app language", async ({ seededPage: page }) => {
  await test.step("open language settings", () =>
    gotoPage(page, "/settings/language", "en", "settings.language.title"))

  // Language option labels are shown in their own language and do not
  // change with the active app language.
  const czechOption = page.getByRole("button", { name: "Čeština" })

  await test.step("select Czech", async () => {
    await czechOption.click()
    await expect(czechOption).toHaveAttribute("aria-pressed", "true")
  })

  await test.step("verify the selection persists after reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    // Switching the app language changes the page heading's text too, so
    // wait for any heading rather than the (now stale) English string.
    await page.getByRole("heading", { level: 2 }).first().waitFor()
    await expect(czechOption).toHaveAttribute("aria-pressed", "true")
  })
})

test("switch the regional (device locale) format", async ({
  seededPage: page,
}) => {
  await test.step("open language settings", () =>
    gotoPage(page, "/settings/language", "en", "settings.language.title"))

  const czechiaOption = page.getByRole("button", {
    name: translate("en", "settings.language.locale.czech.title"),
  })

  await test.step("select Czechia as the regional format", async () => {
    await czechiaOption.click()
    await expect(czechiaOption).toHaveAttribute("aria-pressed", "true")
  })

  await test.step("verify the selection persists after reload", async () => {
    await reloadPage(page, "en", "settings.language.title")
    await expect(czechiaOption).toHaveAttribute("aria-pressed", "true")
  })
})

test("reveal the recovery phrase", async ({ seededPage: page }) => {
  const mnemonicField = page.getByRole("textbox", {
    name: translate("en", "settings.security.mnemonic.label"),
  })

  await test.step("open security settings and reveal the phrase", async () => {
    await gotoPage(page, "/settings/security", "en", "settings.security.title")
    await page
      .getByRole("button", { name: translate("en", "passwordTextarea.show") })
      .click()
  })

  await test.step("verify a plausible recovery phrase is revealed", async () => {
    const mnemonic = await mnemonicField.inputValue()
    expect(mnemonic.trim().split(/\s+/u).length).toBeGreaterThanOrEqual(12)
  })
})

test("toggle error reporting", async ({ seededPage: page }) => {
  await test.step("open privacy settings", () =>
    gotoPage(page, "/settings/privacy", "en", "settings.privacy.title"))

  await test.step("toggle error reporting on and off", async () => {
    // errorReportingEnabled defaults to false (device setting).
    await page
      .getByRole("button", {
        name: translate("en", "settings.privacy.errorReporting.enable"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "settings.privacy.errorReporting.enabled"))
    ).toBeVisible()
    await page
      .getByRole("button", {
        name: translate("en", "settings.privacy.errorReporting.disable"),
      })
      .click()
    await expect(
      page.getByText(
        translate("en", "settings.privacy.errorReporting.disabled")
      )
    ).toBeVisible()
  })
})
