import {
  completeOnboardingDefaults,
  expect,
  gotoPage,
  test,
  translate,
} from "./fixtures.ts"

test("create, switch, and remove a device account", async ({
  seededPage: page,
}) => {
  // Creating and switching accounts spins up a brand new local database each
  // time, which is slower than a plain settings save.
  test.setTimeout(60_000)

  await test.step("open device accounts settings", () =>
    gotoPage(page, "/settings/accounts", "en", "settings.accounts.title"))

  await test.step("create a second account", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.accounts.create.action"),
      })
      .click()
  })

  await test.step("complete onboarding for the new account", () =>
    completeOnboardingDefaults(page, "en"))

  const accountRows = page.locator("li")
  // accountListQuery orders by createdAt ascending, so the first-created
  // account is always the first row regardless of which one is active.
  const [firstCreatedRow, secondCreatedRow] = [
    accountRows.nth(0),
    accountRows.nth(1),
  ]

  await test.step("verify both accounts are listed with the new one active", async () => {
    await gotoPage(page, "/settings/accounts", "en", "settings.accounts.title")
    await expect(accountRows).toHaveCount(2)
    await expect(
      firstCreatedRow.getByRole("button", {
        name: translate("en", "settings.accounts.list.switch"),
      })
    ).toBeVisible()
    await expect(
      secondCreatedRow.getByRole("button", {
        name: translate("en", "settings.accounts.list.current"),
      })
    ).toBeVisible()
  })

  await test.step("switch back to the first-created account", async () => {
    await firstCreatedRow
      .getByRole("button", {
        name: translate("en", "settings.accounts.list.switch"),
      })
      .click()
    await expect(
      firstCreatedRow.getByRole("button", {
        name: translate("en", "settings.accounts.list.current"),
      })
    ).toBeVisible()
    await expect(
      secondCreatedRow.getByRole("button", {
        name: translate("en", "settings.accounts.list.switch"),
      })
    ).toBeVisible()
  })

  await test.step("remove the now non-active second account", async () => {
    await secondCreatedRow
      .getByRole("button", {
        name: translate("en", "settings.accounts.list.remove"),
      })
      .click()
    await expect(accountRows).toHaveCount(1)
  })
})
