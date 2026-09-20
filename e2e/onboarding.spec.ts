import { expect, test } from "@playwright/test"
import { translate } from "./support/i18n.ts"
import { gotoPage } from "./support/navigation.ts"
import { completeOnboarding } from "./support/onboarding.ts"

// A fixed, valid SLIP-39 recovery mnemonic (derived from an arbitrary test
// master key: ffeeddccbbaa99887766554433221100). Never onboarded against
// this app's Evolu relay, so restoring with it always lands on a fresh,
// unsynced account.
const unregisteredTestMnemonic =
  "alto wisdom academic academic anxiety saver envy hour campus decision disease mason slush quantity pumps loyalty bracelet muscle western material"

test("complete onboarding as a new account", async ({ page }) => {
  await test.step("complete onboarding", async () => {
    await completeOnboarding(page, "en")
  })

  await test.step("land on the terminal home screen", async () => {
    await expect(page).toHaveURL("/")
    await expect(
      page.getByRole("button", { name: translate("en", "home.pay") })
    ).toBeVisible()
  })

  await test.step("security settings reveal a 20-word recovery phrase", async () => {
    await gotoPage(page, "/settings/security", "en", "settings.security.title")
    await page
      .getByRole("button", { name: translate("en", "passwordTextarea.show") })
      .click()
    const mnemonic = await page
      .getByRole("textbox", {
        name: translate("en", "settings.security.mnemonic.label"),
      })
      .inputValue()
    expect(mnemonic.trim().split(/\s+/u)).toHaveLength(20)
  })
})

test("a new account starts with Czech tax rates", async ({ page }) => {
  await test.step("complete onboarding", async () => {
    await completeOnboarding(page, "en")
  })

  await test.step("the Czech preset tax rates were seeded", async () => {
    await gotoPage(page, "/settings/tax-rates", "en", "settings.taxRates.title")
    await expect(page.getByText("Základní sazba")).toBeVisible()
    await expect(page.getByText("Snížená sazba")).toBeVisible()
    await expect(page.getByText("Osvobozeno od DPH")).toBeVisible()
    await expect(page.getByText("21%")).toBeVisible()
    await expect(page.getByText("12%")).toBeVisible()
    await expect(page.getByText("0%")).toBeVisible()
  })
})

test("an invalid bank account blocks finishing, an empty one is skipped", async ({
  page,
}) => {
  const finishButton = page.getByRole("button", {
    name: translate("en", "onboarding.finish"),
  })
  const ibanInput = page.getByRole("textbox", {
    name: translate("en", "onboarding.payments.bankAccount.label"),
  })

  await test.step("choose a new account", async () => {
    await gotoPage(page, "/", "en", "onboarding.title")
    await page
      .getByRole("button", { name: translate("en", "onboarding.start.create") })
      .click()
  })

  await test.step("an empty account can be skipped", async () => {
    await expect(finishButton).toBeEnabled()
  })

  await test.step("typing an invalid account keeps Finish disabled and shows the error", async () => {
    await ibanInput.fill("12345")
    await expect(finishButton).toBeDisabled()
    await expect(
      page.getByText(translate("en", "settings.fiatBankAccount.iban.invalid"))
    ).toBeVisible()
  })

  await test.step("an account number is accepted, its bank named, and onboarding completes", async () => {
    await ibanInput.fill("19-2000145399/0800")
    await expect(
      page.getByText(
        translate("en", "onboarding.payments.bankAccount.bankDetected").replace(
          "{bank}",
          "Česká spořitelna"
        )
      )
    ).toBeVisible()
    await expect(finishButton).toBeEnabled()
    await finishButton.click()
    await page
      .getByRole("button", { name: translate("en", "settings.title") })
      .waitFor()
  })
})

test("onboarding restore account starts the sync-wait screen", async ({
  page,
}) => {
  await test.step("choose restore on the start screen", async () => {
    await gotoPage(page, "/", "en", "onboarding.title")
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.start.restore"),
      })
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
