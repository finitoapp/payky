import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import {
  pickInlineOption,
  toggleInlineCheckbox,
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

  await test.step("change the bank account currency", () =>
    pickInlineOption(
      page,
      "settings.fiatBankAccount.currency.label",
      translate("en", "settings.fiat.eur.title")
    ))

  await test.step("verify the new currency persists after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(currencySelect).toContainText("EUR")
  })

  await test.step("disable the cash register", () =>
    toggleInlineCheckbox(page, "settings.cashRegisterAccount.enabled.label"))

  await test.step("verify the cash register stays disabled after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(
      page.getByRole("checkbox", {
        name: translate("en", "settings.cashRegisterAccount.enabled.label"),
      })
    ).not.toBeChecked()
  })
})
