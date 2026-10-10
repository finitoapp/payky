import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"
import { toggleInlineSwitch } from "./support/inline-edit.ts"
import { gotoPage } from "./support/navigation.ts"

test("toggling the home icon switches between numpad and tables, and the choice survives a reload", async ({
  seededPage: page,
}) => {
  const homeToggle = page.getByRole("button", {
    name: translate("en", "nav.pos"),
  })
  const payButton = page.getByRole("button", {
    name: translate("en", "home.pay"),
  })
  const noTableTile = page.getByTestId("no-table-tile")

  await test.step("starts in numpad mode", async () => {
    await expect(payButton).toBeVisible()
    await expect(noTableTile).toHaveCount(0)
  })

  await test.step("toggling switches to tables mode in place", async () => {
    await homeToggle.click()
    await expect(noTableTile).toBeVisible()
    await expect(payButton).toHaveCount(0)
  })

  await test.step("tables mode survives a reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(noTableTile).toBeVisible()
  })

  await test.step("toggling back switches to numpad mode", async () => {
    const backToggle = page.getByRole("button", {
      name: translate("en", "nav.numpad"),
    })
    await backToggle.click()
    await expect(payButton).toBeVisible()
    await expect(noTableTile).toHaveCount(0)
  })

  await test.step("numpad mode survives a reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(payButton).toBeVisible()
  })
})

test("disabling a home mode in settings hides the switch, falls back to the first enabled mode and never leaves none", async ({
  seededPage: page,
}) => {
  const payButton = page.getByRole("button", {
    name: translate("en", "home.pay"),
  })
  const noTableTile = page.getByTestId("no-table-tile")
  const posToggle = page.getByRole("button", {
    name: translate("en", "nav.pos"),
  })
  const numpadToggle = page.getByRole("button", {
    name: translate("en", "nav.numpad"),
  })
  const posSwitch = page.getByRole("switch", {
    name: translate("en", "nav.pos"),
  })
  const numpadSwitch = page.getByRole("switch", {
    name: translate("en", "nav.numpad"),
  })
  const openHomeScreenSettings = () =>
    gotoPage(page, "/settings/home-screen", "en", "settings.homeScreen.title")

  await test.step("the home screen remembers tables mode", async () => {
    await posToggle.click()
    await expect(noTableTile).toBeVisible()
  })

  await test.step("both modes start enabled", async () => {
    await openHomeScreenSettings()
    await expect(numpadSwitch).toBeChecked()
    await expect(posSwitch).toBeChecked()
  })

  await test.step("disabling tables mode leaves the keypad without a switch", async () => {
    // Waits for the save, not just the switch: it flips before the write
    // lands, and the reload below would otherwise read the old modes.
    await toggleInlineSwitch(page, "nav.pos")
    await expect(posSwitch).not.toBeChecked()
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(payButton).toBeVisible()
    await expect(noTableTile).toHaveCount(0)
    await expect(posToggle).toHaveCount(0)
    await expect(numpadToggle).toHaveCount(0)
  })

  await test.step("disabling the last mode is refused with the reason", async () => {
    await openHomeScreenSettings()
    await numpadSwitch.click()
    await expect(
      page.getByText(translate("en", "settings.homeScreen.atLeastOneMode"))
    ).toBeVisible()
    await expect(numpadSwitch).toBeChecked()
  })

  await test.step("re-enabling tables mode brings the remembered mode back", async () => {
    await toggleInlineSwitch(page, "nav.pos")
    await expect(posSwitch).toBeChecked()
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(noTableTile).toBeVisible()
    await expect(numpadToggle).toBeVisible()
  })
})
