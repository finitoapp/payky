import type { Page } from "@playwright/test"

import type { TranslationKey } from "../src/i18n/resources.ts"
import { expect, test } from "./support/fixtures.ts"
import { translate, translateValue } from "./support/i18n.ts"
import { gotoPage, reloadPage } from "./support/navigation.ts"
import { seedOnboarding } from "./support/onboarding.ts"

// Valid 12-word BIP-39 mnemonics (the standard test vectors), so the app
// accepts them as Spark wallets without anything real behind them.
const ownWalletA =
  "legal winner thank year wave sausage worth useful legal winner thank yellow"
const ownWalletB =
  "letter advice cage absurd amount doctor acoustic avoid letter advice cage above"
// Twelve dictionary words whose checksum does not match.
const invalidMnemonic =
  "legal winner thank year wave sausage worth useful legal winner thank thank"

const en = (key: TranslationKey) => translate("en", key)

const sparkCard = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ hasText: en("settings.sparkAccount.form.title") })

const shownMnemonic = (page: Page) =>
  sparkCard(page).getByLabel(en("settings.sparkAccount.mnemonic.label"))

const openChangeWalletDialog = async (page: Page) => {
  await sparkCard(page)
    .getByRole("button", { name: en("settings.sparkAccount.wallet.change") })
    .click()
  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByText(en("settings.sparkAccount.wallet.changeDialog.title"))
  ).toBeVisible()
  return dialog
}

const walletOption = (
  dialog: ReturnType<Page["getByRole"]>,
  titleKey: TranslationKey
) => dialog.getByRole("button", { name: new RegExp(en(titleKey)) })

const switchButton = (dialog: ReturnType<Page["getByRole"]>) =>
  dialog.getByRole("button", {
    name: en("settings.sparkAccount.wallet.switch"),
  })

const switchToOwnWallet = async (page: Page, mnemonic: string) => {
  const dialog = await openChangeWalletDialog(page)
  await dialog
    .getByLabel(en("settings.sparkAccount.mnemonic.label"))
    .fill(mnemonic)
  await switchButton(dialog).click()
  await expect(shownMnemonic(page)).toHaveValue(mnemonic)
}

test.beforeEach(async ({ page }) => {
  await seedOnboarding(page, "en", { spark: true })
  await gotoPage(
    page,
    "/settings/payment-accounts",
    "en",
    "settings.paymentAccounts.title"
  )
})

test("switch from the Payky wallet to your own wallets and back", async ({
  page,
}) => {
  const paykyMnemonic = await shownMnemonic(page).inputValue()

  await test.step("start on the Payky wallet", async () => {
    await expect(
      sparkCard(page).getByText(
        en("settings.sparkAccount.wallet.payky.title"),
        {
          exact: true,
        }
      )
    ).toBeVisible()
    await expect(
      sparkCard(page).getByText(en("settings.sparkAccount.form.description"))
    ).toBeVisible()
  })

  await test.step("switch to your own wallet", () =>
    switchToOwnWallet(page, ownWalletA))

  await test.step("your own wallet is shown as active and survives a reload", async () => {
    await reloadPage(page, "en", "settings.paymentAccounts.title")
    await expect(shownMnemonic(page)).toHaveValue(ownWalletA)
    await expect(
      sparkCard(page).getByText(
        en("settings.sparkAccount.wallet.custom.title"),
        {
          exact: true,
        }
      )
    ).toBeVisible()
    await expect(
      sparkCard(page).getByText(
        en("settings.sparkAccount.form.customDescription")
      )
    ).toBeVisible()
  })

  await test.step("replace your own wallet with another one", () =>
    switchToOwnWallet(page, ownWalletB))

  await test.step("switch back to the Payky wallet", async () => {
    const dialog = await openChangeWalletDialog(page)
    await walletOption(
      dialog,
      "settings.sparkAccount.wallet.payky.title"
    ).click()
    await expect(
      dialog.getByLabel(en("settings.sparkAccount.mnemonic.label"))
    ).toHaveCount(0)
    await switchButton(dialog).click()

    await expect(shownMnemonic(page)).toHaveValue(paykyMnemonic)
    await expect(
      sparkCard(page).getByText(en("settings.sparkAccount.form.description"))
    ).toBeVisible()
  })
})

test("the change wallet dialog only switches to a wallet that makes sense", async ({
  page,
}) => {
  const paykyMnemonic = await shownMnemonic(page).inputValue()

  await test.step("the Payky wallet cannot be switched to while in use", async () => {
    const dialog = await openChangeWalletDialog(page)
    const payky = walletOption(
      dialog,
      "settings.sparkAccount.wallet.payky.title"
    )
    await expect(payky).toContainText(
      en("settings.sparkAccount.wallet.changeDialog.inUse")
    )
    await payky.click()
    await expect(switchButton(dialog)).toBeDisabled()
    await walletOption(
      dialog,
      "settings.sparkAccount.wallet.custom.title"
    ).click()
  })

  await test.step("an incomplete or invalid mnemonic is refused", async () => {
    const dialog = page.getByRole("dialog")
    const input = dialog.getByLabel(en("settings.sparkAccount.mnemonic.label"))

    await input.fill("legal winner thank year")
    await expect(
      dialog.getByText(
        translateValue(
          "en",
          "settings.sparkAccount.wallet.changeDialog.wordCount",
          4
        )
      )
    ).toBeVisible()
    await expect(switchButton(dialog)).toBeDisabled()

    await input.fill(invalidMnemonic)
    await expect(
      dialog.getByText(en("settings.sparkAccount.wallet.changeDialog.invalid"))
    ).toBeVisible()
    await expect(switchButton(dialog)).toBeDisabled()
  })

  await test.step("cancel keeps the current wallet", async () => {
    const dialog = page.getByRole("dialog")
    await dialog
      .getByLabel(en("settings.sparkAccount.mnemonic.label"))
      .fill(ownWalletA)
    await dialog
      .getByRole("button", { name: en("settings.sparkAccount.wallet.cancel") })
      .click()

    await expect(dialog).toHaveCount(0)
    await expect(shownMnemonic(page)).toHaveValue(paykyMnemonic)
  })

  await test.step("the wallet already in use is refused", async () => {
    await switchToOwnWallet(page, ownWalletA)

    const dialog = await openChangeWalletDialog(page)
    await dialog
      .getByLabel(en("settings.sparkAccount.mnemonic.label"))
      .fill(ownWalletA)
    await expect(
      dialog.getByText(en("settings.sparkAccount.wallet.changeDialog.current"))
    ).toBeVisible()
    await expect(switchButton(dialog)).toBeDisabled()
  })
})
