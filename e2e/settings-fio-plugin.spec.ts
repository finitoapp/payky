import { expect, gotoPage, test, translate } from "./fixtures.ts"

test("save Fio settings and add a token, in either order", async ({
  seededPage: page,
}) => {
  // This page has no other coverage, and its two moving parts are exactly the
  // ones that used to be wrong: the token was written by the settings form
  // (so every save duplicated it), and everything was gated on whether the
  // `fioPlugin` row existed yet.
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => consoleErrors.push(String(error)))

  const save = page.getByRole("button", {
    name: translate("en", "settings.fioPlugin.save"),
  })
  const tokenField = page.getByLabel(
    translate("en", "settings.fioPlugin.token.label")
  )
  const tokenRows = page.locator("li", {
    hasText: translate("en", "settings.fioPlugin.tokens.item"),
  })

  await test.step("open with no plugin row saved yet", async () => {
    await gotoPage(
      page,
      "/settings/fio-plugin",
      "en",
      "settings.fioPlugin.title"
    )

    // The plugin id is fixed, so there is one Save button rather than a
    // create-then-edit flow, and tokens are reachable straight away.
    await expect(save).toBeVisible()
    await expect(tokenField).toBeVisible()
  })

  await test.step("add a token before the plugin exists", async () => {
    await tokenField.fill("e2e-fio-token")
    await page
      .getByRole("button", {
        name: translate("en", "settings.fioPlugin.tokens.add.submit"),
      })
      .click()
    await expect(tokenRows).toHaveCount(1)
  })

  await test.step("save the settings without touching the token", async () => {
    await save.click()
    await expect(
      page.getByText(translate("en", "settings.fioPlugin.saved"))
    ).toBeVisible()
    // The token is neither duplicated nor rewritten by an unrelated save.
    await expect(tokenRows).toHaveCount(1)
  })

  expect(consoleErrors).toEqual([])
})
