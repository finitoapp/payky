import { expect, gotoPage, reloadPage, test, translate } from "./fixtures.ts"

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

  await test.step("change the bank account currency and save", async () => {
    await currencySelect.click()
    await page
      .getByRole("option", { name: translate("en", "settings.fiat.eur.title") })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.fiatBankAccount.save"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.fiatBankAccount.saved"))
      .waitFor()
  })

  await test.step("verify the new currency persists after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(currencySelect).toContainText("EUR")
  })

  await test.step("disable the cash register and save", async () => {
    await page
      .getByRole("checkbox", {
        name: translate("en", "settings.cashRegisterAccount.enabled.label"),
      })
      .click()
    await page
      .getByRole("button", {
        name: translate("en", "settings.cashRegisterAccount.save"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.cashRegisterAccount.saved"))
      .waitFor()
  })

  await test.step("verify the cash register stays disabled after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(
      page.getByRole("checkbox", {
        name: translate("en", "settings.cashRegisterAccount.enabled.label"),
      })
    ).not.toBeChecked()
  })
})
