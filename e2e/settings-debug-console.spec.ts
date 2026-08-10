import { expect, gotoPage, test, translate } from "./fixtures.ts"

test("view, pause, and clear captured console output", async ({
  seededPage: page,
}) => {
  await test.step("open the debug console", () =>
    gotoPage(
      page,
      "/settings/debug-console",
      "en",
      "settings.debugConsole.title"
    ))

  const entries = page.locator("article")
  const pauseButton = page.getByRole("button", {
    name: translate("en", "settings.debugConsole.pause"),
  })
  const resumeButton = page.getByRole("button", {
    name: translate("en", "settings.debugConsole.resume"),
  })

  await test.step("verify entries captured during onboarding are shown", async () => {
    await expect(entries.first()).toBeVisible()
  })

  await test.step("pause then resume capturing", async () => {
    await pauseButton.click()
    await resumeButton.waitFor()
    await resumeButton.click()
    await pauseButton.waitFor()
  })

  await test.step("clear the history", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "settings.debugConsole.clear"),
      })
      .click()
    await expect(
      page.getByText(translate("en", "settings.debugConsole.empty"))
    ).toBeVisible()
    await expect(entries).toHaveCount(0)
  })
})
