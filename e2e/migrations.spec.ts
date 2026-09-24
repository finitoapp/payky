import { expect, screenshotDir, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import {
  holdMigrations,
  releaseMigrations,
  seedLegacyFioPlugin,
  stopHoldingMigrations,
} from "./support/migrations.ts"
import { gotoPage } from "./support/navigation.ts"

test("the migration popup reports a run in progress, then its success", async ({
  seededPage: page,
}) => {
  await test.step("leave behind the data an older version would have written", () =>
    seedLegacyFioPlugin(page))

  await test.step("arm the hold so the running state can be captured", () =>
    holdMigrations(page))

  const dialog = page.getByRole("alertdialog")
  const closeButton = dialog.getByRole("button", {
    name: translate("en", "migration.close"),
  })

  await test.step("the popup reports the migration while it runs", async () => {
    await page.reload()

    await expect(
      dialog.getByRole("heading", {
        name: translate("en", "migration.running.title"),
      })
    ).toBeVisible()
    await expect(
      dialog.getByText(translate("en", "migration.running.description"))
    ).toBeVisible()
    // Nothing to decide until it finishes, so there is no way to dismiss it.
    await expect(closeButton).toBeHidden()

    await page.screenshot({
      path: `${screenshotDir}/migration-running.png`,
      fullPage: true,
    })
  })

  await test.step("it stays open with a success message once the run finishes", async () => {
    await releaseMigrations(page)

    await expect(
      dialog.getByRole("heading", {
        name: translate("en", "migration.success.title"),
      })
    ).toBeVisible()
    await expect(
      dialog.getByText(translate("en", "migration.success.description"))
    ).toBeVisible()
    await expect(closeButton).toBeVisible()

    await page.screenshot({
      path: `${screenshotDir}/migration-success.png`,
      fullPage: true,
    })
  })

  await test.step("and the user dismisses it themselves", async () => {
    await closeButton.click()
    await expect(dialog).toBeHidden()
  })

  // The popup is only worth screenshotting if it was telling the truth: the
  // legacy plugin's token now hangs off the fixed id, which is the one the
  // settings page reads.
  await test.step("the migrated token shows up in the Fio settings", async () => {
    await stopHoldingMigrations(page)
    await gotoPage(
      page,
      "/settings/payment-accounts/iban/fio-plugin",
      "en",
      "settings.fioPlugin.title"
    )
    // The masked tail of the token `__e2eSeedLegacyFioPlugin` wrote, which
    // only appears here if the migration re-keyed it onto the fixed id.
    await expect(page.getByText("********1234")).toBeVisible()
    await expect(
      page.getByText(translate("en", "settings.fioPlugin.tokens.empty"))
    ).toBeHidden()
  })
})
