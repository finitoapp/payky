import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"

/**
 * The direction is the part that silently breaks: get it wrong and back looks
 * like forward. This records the view-transition types the router asks for.
 */
declare global {
  interface Window {
    __viewTransitionTypes?: Array<string>
  }
}

// The suite runs with reduced motion, which switches the animation off.
test.use({ reducedMotion: "no-preference" })

test("pushes and pops inside a stack transition, the money path does not", async ({
  seededPage: page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.evaluate(() => {
    const types: Array<string> = []
    window.__viewTransitionTypes = types
    const start = document.startViewTransition.bind(document)
    document.startViewTransition = (update) => {
      types.push(
        typeof update === "function"
          ? "untyped"
          : [...(update?.types ?? [])].join(",")
      )
      return start(update)
    }
  })

  const button = (key: Parameters<typeof translate>[1]) =>
    page.getByRole("button", { name: translate("en", key) })
  const heading = (key: Parameters<typeof translate>[1]) =>
    page.getByRole("heading", { name: translate("en", key) })

  // Two levels down into settings, then back out of both.
  await button("nav.settings").click()
  await expect(heading("settings.title")).toBeVisible()

  await page
    .getByRole("link", {
      name: new RegExp(`^${translate("en", "settings.items.title")}\\b`),
    })
    .click()
  await expect(heading("settings.items.title")).toBeVisible()

  await page.goBack()
  await expect(heading("settings.title")).toBeVisible()

  await page.goBack()
  await expect(button("nav.activity")).toBeVisible()

  // The other stack, popped with the app's own back button.
  await button("nav.activity").click()
  await expect(heading("activity.title")).toBeVisible()

  await button("nav.back").click()
  await expect(button("nav.activity")).toBeVisible()

  // The money path is deliberately left out: opening a bill stays an instant
  // swap, leaving the recorded types untouched.
  const switchToPos = button("nav.pos")
  if (await switchToPos.isVisible()) {
    await switchToPos.click()
  }
  await page
    .getByTestId("no-table-tile")
    .getByRole("link", { name: translate("en", "tables.tile.newBill") })
    .click()
  await expect(heading("bill.title")).toBeVisible()

  expect(await page.evaluate(() => window.__viewTransitionTypes)).toEqual([
    "forward",
    "forward",
    "backward",
    "backward",
    "forward",
    "backward",
  ])
})
