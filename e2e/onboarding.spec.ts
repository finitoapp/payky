import { expect, test } from "@playwright/test"
import { completeOnboarding, gotoPage, translate } from "./fixtures.ts"

// A fixed, valid SLIP-39 recovery mnemonic (derived from an arbitrary test
// master key: ffeeddccbbaa99887766554433221100). Never onboarded against
// this app's Evolu relay, so restoring with it always lands on a fresh,
// unsynced account.
const unregisteredTestMnemonic =
  "alto wisdom academic academic anxiety saver envy hour campus decision disease mason slush quantity pumps loyalty bracelet muscle western material"

test("complete onboarding as a new account", async ({ page }) => {
  let onboardingMnemonic = ""

  await test.step("complete onboarding", async () => {
    onboardingMnemonic = await completeOnboarding(page, "en")
    expect(
      onboardingMnemonic.trim().split(/\s+/u).length
    ).toBeGreaterThanOrEqual(12)
  })

  await test.step("land on the terminal home screen", async () => {
    await expect(page).toHaveURL("/")
    await expect(
      page.getByRole("button", { name: translate("en", "home.pay") })
    ).toBeVisible()
  })

  await test.step("verify security settings reveal the same recovery phrase", async () => {
    await gotoPage(page, "/settings/security", "en", "settings.security.title")
    await page
      .getByRole("button", { name: translate("en", "passwordTextarea.show") })
      .click()
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.security.mnemonic.label"),
      })
    ).toHaveValue(onboardingMnemonic)
  })
})

test("onboarding restore account starts the sync-wait screen", async ({
  page,
}) => {
  await test.step("start onboarding and choose restore", async () => {
    await gotoPage(page, "/", "en", "onboarding.title")
    await page
      .getByRole("button", { name: translate("en", "onboarding.next") })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.accountChoice.new.title"),
      })
      .waitFor()
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.accountChoice.restore.title"),
      })
      .click()
    await page
      .getByRole("button", { name: translate("en", "onboarding.next") })
      .click()
  })

  await test.step("submit a recovery phrase", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.restore.action"),
      })
      .waitFor()
    await page.getByRole("textbox").fill(unregisteredTestMnemonic)
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.restore.action"),
      })
      .click()
  })

  await test.step("land on the restore sync-wait screen", async () => {
    await expect(page).toHaveURL(/\/restore-account$/)
    await expect(
      page.getByRole("heading", {
        name: translate("en", "accountRestore.title"),
      })
    ).toBeVisible()
  })
})
