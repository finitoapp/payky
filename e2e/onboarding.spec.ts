import { expect, test } from "@playwright/test"
import { translate } from "./support/i18n.ts"
import { gotoPage } from "./support/navigation.ts"
import {
  completeOnboarding,
  createUnregisteredMnemonic,
  submitRestorePhrase,
} from "./support/onboarding.ts"

test("complete onboarding as a new account, without backing up the recovery phrase", async ({
  page,
}) => {
  await test.step("complete onboarding", () => completeOnboarding(page, "en"))

  await test.step("land on the terminal home screen", async () => {
    await expect(page).toHaveURL("/")
    await expect(
      page.getByRole("button", { name: translate("en", "home.pay") })
    ).toBeVisible()
  })

  await test.step("security settings still hand out the recovery phrase", async () => {
    await gotoPage(page, "/settings/security", "en", "settings.security.title")
    await page
      .getByRole("button", { name: translate("en", "passwordTextarea.show") })
      .click()
    const mnemonic = await page
      .getByRole("textbox", {
        name: translate("en", "settings.security.mnemonic.label"),
      })
      .inputValue()
    expect(mnemonic.trim().split(/\s+/u).length).toBeGreaterThanOrEqual(12)
  })
})

test("onboarding in English still starts a Czech account in CZK", async ({
  page,
}) => {
  await test.step("complete onboarding in English", () =>
    completeOnboarding(page, "en"))

  await test.step("the business is in the Czech Republic and uses CZK", async () => {
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
    ).toContainText(translate("en", "country.cz"))
    await expect(
      page.getByRole("combobox", {
        name: translate("en", "settings.legalEntity.currency.label"),
      })
    ).toContainText(translate("en", "settings.fiat.czk.title"))
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

test("the payment methods step reports a missing or invalid IBAN on Finish", async ({
  page,
}) => {
  const finishButton = page.getByRole("button", {
    name: translate("en", "onboarding.finish"),
  })
  const ibanInput = page.getByRole("textbox", {
    name: translate("en", "settings.fiatBankAccount.iban.label"),
  })

  await test.step("walk onboarding up to the payment methods step", async () => {
    await page.goto("/onboarding", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("heading", { name: translate("en", "onboarding.title") })
      .waitFor()
    await page
      .getByRole("button", {
        name: translate("en", "accountChoice.new.title"),
      })
      .click()
  })

  await test.step("bank transfer is on by default, with no error shown yet", async () => {
    await expect(
      page.getByRole("checkbox", {
        name: translate("en", "onboarding.payments.iban.title"),
      })
    ).toBeChecked()
    await expect(finishButton).toBeEnabled()
    await expect(ibanInput).toHaveAttribute("aria-invalid", "false")
  })

  await test.step("Finish with an empty IBAN marks the input instead of finishing", async () => {
    await finishButton.click()
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
    await finishButton.click()
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
    await finishButton.click()
    await page
      .getByRole("button", { name: translate("en", "settings.title") })
      .waitFor()
  })
})

// Offline is the one sync failure e2e can produce deterministically, and it
// wins over whatever the relays reported. It is switched on only once the
// restore page has loaded: offline also blocks the dev server's lazy chunks.
test("an offline restore fails, and another phrase returns to the restore step", async ({
  page,
  context,
}) => {
  await test.step("submit a recovery phrase and go offline", async () => {
    await page.goto("/onboarding", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("heading", { name: translate("en", "onboarding.title") })
      .waitFor()
    await submitRestorePhrase(page, "en", await createUnregisteredMnemonic())
    await context.setOffline(true)
  })

  await test.step("the sync fails with the offline explanation", async () => {
    await expect(
      page.getByRole("heading", {
        name: translate("en", "accountRestore.failed.title"),
      })
    ).toBeVisible()
    await expect(
      page.getByText(translate("en", "accountRestore.failed.offline"))
    ).toBeVisible()
  })

  await test.step("use a different phrase", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "accountRestore.action.otherPhrase"),
      })
      .click()
    await expect(page).toHaveURL(/\/onboarding$/u)
    await expect(
      page.getByRole("button", {
        name: translate("en", "onboarding.restore.action"),
      })
    ).toBeVisible()
    await expect(page.getByRole("textbox")).toHaveValue("")
  })
})

test("setting up a phrase whose sync failed warns, then goes straight to payments", async ({
  page,
  context,
}) => {
  await test.step("fail an offline restore", async () => {
    await page.goto("/onboarding", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("heading", { name: translate("en", "onboarding.title") })
      .waitFor()
    await submitRestorePhrase(page, "en", await createUnregisteredMnemonic())
    await context.setOffline(true)
    await page
      .getByRole("heading", {
        name: translate("en", "accountRestore.failed.title"),
      })
      .waitFor()
  })

  await test.step("confirm the overwrite warning", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "accountRestore.action.setupNew"),
      })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "accountRestore.setupNew.confirm.confirm"),
        exact: true,
      })
      .click()
    await context.setOffline(false)
  })

  await test.step("finish on the payments step", async () => {
    await page.getByRole("textbox").fill("CZ6508000000192000145399")
    await page
      .getByRole("button", { name: translate("en", "onboarding.finish") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "settings.title") })
      .waitFor()
  })

  await test.step("the empty account from the first start is gone", async () => {
    await gotoPage(page, "/settings/accounts", "en", "settings.accounts.title")
    await expect(
      page.getByTestId("account-list").getByRole("listitem")
    ).toHaveCount(1)
  })
})
