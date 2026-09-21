import { expect, test } from "./support/fixtures.ts"
import { translate, translateValue } from "./support/i18n.ts"
import {
  expandAdvancedOptions,
  pickInlineOption,
  toggleInlineSwitch,
} from "./support/inline-edit.ts"
import { gotoPage, reloadPage } from "./support/navigation.ts"

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

  await test.step("verify the new currency persists after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expandAdvancedOptions(
      page,
      "settings.fiatBankAccount.form.title",
      "settings.fiatBankAccount.advanced"
    )
    await expect(currencySelect).toContainText(
      translate("en", "settings.fiat.eur.title")
    )
  })

  await test.step("make the bank account default", async () => {
    await page
      .getByRole("button", {
        name: translateValue(
          "en",
          "settings.paymentAccounts.default.set.aria",
          translate("en", "settings.paymentAccounts.method.iban")
        ),
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
        name: translateValue(
          "en",
          "settings.paymentAccounts.default.set.aria",
          translate("en", "settings.paymentAccounts.method.cashRegister")
        ),
      })
    ).toBeDisabled()
  })

  await test.step("verify default and disabled methods persist after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
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
