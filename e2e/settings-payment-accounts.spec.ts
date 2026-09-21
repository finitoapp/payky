import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import { gotoPage, reloadPage } from "./support/navigation.ts"

test("edit the bank account and switch cash off", async ({
  seededPage: page,
}) => {
  await test.step("open payment methods settings", () =>
    gotoPage(
      page,
      "/settings/payment-accounts",
      "en",
      "settings.paymentAccounts.title"
    ))

  const accountInput = page.getByRole("textbox", {
    name: translate("en", "settings.paymentMethods.bank.account.label"),
  })

  await test.step("replace the bank account by its account number; it saves itself", async () => {
    await accountInput.fill("19-2000145399/0800")
    await expect(
      page.getByText(
        translate("en", "settings.paymentMethods.bank.derived")
          .replace("{bank}", "Česká spořitelna")
          .replace("{currency}", "CZK")
          .replace(
            "{format}",
            translate("en", "settings.fiatBankAccount.qrFormat.spayd")
          )
      )
    ).toBeVisible()
    await page
      .getByText(translate("en", "settings.paymentMethods.bank.saved"))
      .waitFor()
  })

  await test.step("the account persists as an IBAN after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(accountInput).toHaveValue("CZ6508000000192000145399")
  })

  await test.step("switch bitcoin between cashu and spark", async () => {
    // The seed enables cash and the bank account only; bitcoin comes on
    // here, on cashu, as the switch does for a merchant.
    const bitcoinSwitch = page.getByRole("switch", {
      name: translate("en", "settings.paymentMethods.bitcoin.enabled"),
    })
    if (!(await bitcoinSwitch.isChecked())) await bitcoinSwitch.click()
    await expect(bitcoinSwitch).toBeChecked()
    const mintInput = page.getByRole("textbox", {
      name: translate("en", "settings.cashuAccount.mintUrl.label"),
    })
    const mnemonicInput = page.getByRole("textbox", {
      name: translate("en", "settings.sparkAccount.mnemonic.label"),
    })
    await expect(mintInput).toBeVisible()
    await page
      .getByRole("tab", {
        name: translate("en", "settings.paymentMethods.bitcoin.spark"),
      })
      .click()
    await expect(mnemonicInput).toBeVisible()
    await expect(mintInput).toBeHidden()
    await page
      .getByRole("tab", {
        name: translate("en", "settings.paymentMethods.bitcoin.cashu"),
      })
      .click()
    await expect(mintInput).toBeVisible()
    await expect(mnemonicInput).toBeHidden()
  })

  await test.step("cashu stays selected after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.cashuAccount.mintUrl.label"),
      })
    ).toBeVisible()
  })

  await test.step("the seeded default is cash; bank transfer takes it over", async () => {
    await expect(page.getByTestId("payment-method-default-cash")).toBeVisible()
    const makeDefaultButtons = page.getByRole("button", {
      name: translate("en", "settings.paymentMethods.makeDefault"),
    })
    // Cards are laid out bank, bitcoin, cash, so the first "set as default"
    // is the bank card's.
    await makeDefaultButtons.first().click()
    await expect(page.getByTestId("payment-method-default-bank")).toBeVisible()
    await expect(page.getByTestId("payment-method-default-cash")).toBeHidden()
  })

  await test.step("the default persists after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(page.getByTestId("payment-method-default-bank")).toBeVisible()
  })

  await test.step("switch cash off", async () => {
    const cashSwitch = page.getByRole("switch", {
      name: translate("en", "settings.paymentMethods.cash.enabled"),
    })
    await expect(cashSwitch).toBeChecked()
    await cashSwitch.click()
    await expect(cashSwitch).not.toBeChecked()
  })

  await test.step("cash stays off after reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(
      page.getByRole("switch", {
        name: translate("en", "settings.paymentMethods.cash.enabled"),
      })
    ).not.toBeChecked()
  })

  await test.step("switching the default method off hands the pill to another enabled method", async () => {
    const bankSwitch = page.getByRole("switch", {
      name: translate("en", "settings.paymentMethods.bank.enabled"),
    })
    await bankSwitch.click()
    await expect(bankSwitch).not.toBeChecked()
    await expect(page.getByTestId("payment-method-default-bank")).toBeHidden()
    await expect(
      page.getByTestId("payment-method-default-bitcoin")
    ).toBeVisible()
  })
})
