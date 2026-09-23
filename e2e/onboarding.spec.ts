import { expect, test } from "@playwright/test"
import { translate } from "./support/i18n.ts"
import { gotoPage } from "./support/navigation.ts"
import {
  chooseOnboardingCountry,
  chooseOnboardingCurrency,
  completeOnboarding,
} from "./support/onboarding.ts"

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

test("choosing a country during onboarding seeds its tax rates", async ({
  page,
}) => {
  await test.step("complete onboarding, choosing the Czech Republic", async () => {
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

test("the payment methods step reports a missing or invalid IBAN on Next", async ({
  page,
}) => {
  const nextButton = page.getByRole("button", {
    name: translate("en", "onboarding.next"),
  })
  const ibanInput = page.getByRole("textbox", {
    name: translate("en", "settings.fiatBankAccount.iban.label"),
  })

  await test.step("walk onboarding up to the payment methods step", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("heading", { name: translate("en", "onboarding.title") })
      .waitFor()
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.accountChoice.new.title"),
      })
      .click()
    await chooseOnboardingCountry(page, "en", "country.cz")
    await nextButton.click()
  })

  await test.step("bank transfer is on by default, with no error shown yet", async () => {
    await expect(
      page.getByRole("checkbox", {
        name: translate("en", "onboarding.payments.iban.title"),
      })
    ).toBeChecked()
    await expect(nextButton).toBeEnabled()
    await expect(ibanInput).toHaveAttribute("aria-invalid", "false")
  })

  await test.step("Next with an empty IBAN marks the input instead of advancing", async () => {
    await nextButton.click()
    await expect(ibanInput).toHaveAttribute("aria-invalid", "true")
    await expect(
      page.getByText(translate("en", "settings.fiatBankAccount.iban.required"))
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "onboarding.payments.title"), {
        exact: true,
      })
    ).toBeVisible()
  })

  await test.step("an invalid IBAN swaps the message and still holds the step", async () => {
    await ibanInput.fill("12345")
    await nextButton.click()
    await expect(
      page.getByText(translate("en", "settings.fiatBankAccount.iban.invalid"))
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "onboarding.payments.title"), {
        exact: true,
      })
    ).toBeVisible()
  })

  await test.step("fixing the IBAN lets onboarding complete", async () => {
    await ibanInput.fill("CZ6508000000192000145399")
    await nextButton.click()
    await page
      .getByRole("checkbox", {
        name: translate("en", "onboarding.account.mnemonic.confirm"),
      })
      .click()
    await page
      .getByRole("button", { name: translate("en", "onboarding.finish") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "settings.title") })
      .waitFor()
  })
})

test("onboarding restore account starts the sync-wait screen", async ({
  page,
}) => {
  await test.step("start onboarding and choose restore", async () => {
    await gotoPage(page, "/", "en", "onboarding.title")
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

test("finish reports an unconfirmed recovery phrase, which can be copied", async ({
  page,
}) => {
  const finishButton = page.getByRole("button", {
    name: translate("en", "onboarding.finish"),
  })
  const confirmCheckbox = page.getByRole("checkbox", {
    name: translate("en", "onboarding.account.mnemonic.confirm"),
  })

  // navigator.clipboard.writeText() otherwise silently hangs in Chromium
  // without an explicit permission grant, and the copy button's toast never
  // fires either way.
  await page.context().grantPermissions(["clipboard-write"])

  await test.step("walk onboarding up to the account step", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("heading", { name: translate("en", "onboarding.title") })
      .waitFor()
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.accountChoice.new.title"),
      })
      .click()
    await chooseOnboardingCountry(page, "en", "country.cz")
    await page
      .getByRole("button", { name: translate("en", "onboarding.next") })
      .click()
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.fiatBankAccount.iban.label"),
      })
      .fill("CZ6508000000192000145399")
    await page
      .getByRole("button", { name: translate("en", "onboarding.next") })
      .click()
    await finishButton.waitFor()
  })

  await test.step("finishing without confirming marks the checkbox instead", async () => {
    await expect(finishButton).toBeEnabled()
    await finishButton.click()
    await expect(confirmCheckbox).toHaveAttribute("aria-invalid", "true")
    await expect(
      page.getByText(translate("en", "onboarding.account.mnemonic.required"))
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "onboarding.account.title"), {
        exact: true,
      })
    ).toBeVisible()
  })

  await test.step("the recovery phrase can be copied", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.security.mnemonic.copy"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "settings.security.mnemonic.copied"))
    ).toBeVisible()
  })

  await test.step("confirming the checkbox lets finish complete onboarding", async () => {
    await confirmCheckbox.click()
    await expect(confirmCheckbox).toHaveAttribute("aria-invalid", "false")
    await finishButton.click()
    await page
      .getByRole("button", { name: translate("en", "settings.title") })
      .waitFor()
  })
})

test("the currency step defaults to the chosen country's currency, not the UI language", async ({
  page,
}) => {
  await test.step("walk onboarding in English, choosing the Czech Republic", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("heading", { name: translate("en", "onboarding.title") })
      .waitFor()
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.accountChoice.new.title"),
      })
      .click()
    await chooseOnboardingCountry(page, "en", "country.cz")
  })

  await test.step("Czech koruna is preselected, not the US dollar", async () => {
    await expect(
      page.getByRole("combobox", {
        name: translate("en", "onboarding.countryCurrency.currency.label"),
      })
    ).toContainText(translate("en", "settings.fiat.czk.title"))
  })
})

test("changing the language after picking a currency does not reset that choice", async ({
  page,
}) => {
  const currencySelect = page.getByRole("combobox", {
    name: translate("en", "onboarding.countryCurrency.currency.label"),
  })

  await test.step("walk to the currency step and explicitly pick US dollar", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("heading", { name: translate("en", "onboarding.title") })
      .waitFor()
    await page
      .getByRole("button", {
        name: translate("en", "onboarding.accountChoice.new.title"),
      })
      .click()
    await chooseOnboardingCountry(page, "en", "country.cz")
    await chooseOnboardingCurrency(page, "en", "settings.fiat.usd.title")
    await expect(currencySelect).toContainText(
      translate("en", "settings.fiat.usd.title")
    )
  })

  await test.step("switch to Czech from the header picker, without leaving the step", async () => {
    await page
      .getByRole("combobox", {
        name: translate("en", "onboarding.language.title"),
      })
      .click()
    await page.getByRole("option", { name: "Čeština" }).click()
  })

  await test.step("the step now reads in Czech and keeps the explicit US dollar choice", async () => {
    await expect(
      page.getByRole("button", { name: translate("cs", "onboarding.next") })
    ).toBeVisible()
    await expect(
      page.getByRole("combobox", {
        name: translate("cs", "onboarding.countryCurrency.currency.label"),
      })
    ).toContainText(translate("cs", "settings.fiat.usd.title"))
  })
})
