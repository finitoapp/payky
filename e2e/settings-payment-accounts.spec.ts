import type { TranslationKey } from "../src/i18n/resources.ts"
import { expect, test } from "./support/fixtures.ts"
import { nameParam, translate } from "./support/i18n.ts"
import {
  expandAdvancedOptions,
  pickInlineOption,
  toggleInlineSwitch,
} from "./support/inline-edit.ts"
import { gotoPage, reloadPage } from "./support/navigation.ts"

const setAsDefaultButton = (methodTitleKey: TranslationKey) =>
  nameParam(
    "settings.paymentAccounts.default.set.aria",
    translate("en", methodTitleKey)
  )

test("edit the fiat bank account and cash register settings", async ({
  seededPage: page,
}) => {
  await test.step("open payment accounts settings", () =>
    gotoPage(
      page,
      "/settings/payment-accounts",
      "en",
      "settings.paymentAccounts.title"
    ))

  const currencySelect = page.getByRole("combobox", {
    name: translate("en", "settings.fiatBankAccount.currency.label"),
  })

  // The default-payment-method steps run before the currency change on
  // purpose: `setDefaultPaymentMethod` only accepts a bank account whose
  // currency matches the app's fiat currency, so once this account is on EUR
  // its "Set as default" button is correctly disabled.
  await test.step("make the bank account default", async () => {
    await page
      .getByRole("button", {
        name: setAsDefaultButton("settings.paymentAccounts.method.iban"),
      })
      .click()

    const bankSwitch = page.getByRole("switch", {
      name: translate("en", "settings.fiatBankAccount.enabled.label"),
    })
    await bankSwitch.click()
    await expect(
      page.getByText(
        translate("en", "settings.paymentAccounts.default.deactivate")
      )
    ).toBeVisible()
    await expect(bankSwitch).toBeChecked()
  })

  await test.step("disable the cash register and prevent it becoming default", async () => {
    await toggleInlineSwitch(page, "settings.cashRegisterAccount.enabled.label")

    await expect(
      page.getByRole("button", {
        name: setAsDefaultButton(
          "settings.paymentAccounts.method.cashRegister"
        ),
      })
    ).toBeDisabled()
  })

  await test.step("open the bank account's advanced options", () =>
    expandAdvancedOptions(
      page,
      "settings.fiatBankAccount.form.title",
      "settings.fiatBankAccount.advanced"
    ))

  await test.step("change the bank account currency", () =>
    pickInlineOption(
      page,
      "settings.fiatBankAccount.currency.label",
      translate("en", "settings.fiat.eur.title")
    ))

  await test.step("verify the currency, default and disabled methods persist after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expandAdvancedOptions(
      page,
      "settings.fiatBankAccount.form.title",
      "settings.fiatBankAccount.advanced"
    )
    await expect(currencySelect).toContainText(
      translate("en", "settings.fiat.eur.title")
    )
    await expect(
      page.getByRole("switch", {
        name: translate("en", "settings.cashRegisterAccount.enabled.label"),
      })
    ).not.toBeChecked()
    await expect(
      page.getByRole("switch", {
        name: translate("en", "settings.fiatBankAccount.enabled.label"),
      })
    ).toBeChecked()
  })
})
