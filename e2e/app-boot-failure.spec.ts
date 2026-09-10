import { expect, test, translate } from "./fixtures.ts"

/**
 * Stands in for the real boot failures that *throw* — workers unavailable in
 * a legacy WebView, a service-worker cache serving index.html without the
 * chunk it asks for. Evolu builds its shared worker eagerly in
 * `createEvoluDeps`, before either database client exists, so this takes the
 * whole app down at the point where the app singletons are created.
 *
 * Note that a failing *database* worker does not land here: Evolu leaves
 * that promise pending instead of rejecting, so the app hangs on the boot
 * spinner with nothing thrown for a boundary to catch.
 */
const breakSharedWorker = `
  (() => {
    window.SharedWorker = class {
      constructor() {
        throw new Error("Simulated boot failure")
      }
    }
  })()
`

test("a crash while booting the app singletons shows the error card, not a stuck spinner", async ({
  seededPage: page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.addInitScript({ content: breakSharedWorker })

  await page.goto("/", { waitUntil: "domcontentloaded" })

  // `CardTitle` is a div, not a heading.
  await expect(page.getByText(translate("en", "appError.title"))).toBeVisible()
  await expect(
    page.getByText("Simulated boot failure", { exact: true })
  ).toBeVisible()
  // The boot spinner covers the whole viewport, so leaving it up would hide
  // the card behind it.
  await expect(page.locator("#app-loader")).toHaveCount(0)
  await expect(
    page.getByText(translate("en", "appError.version"))
  ).toBeVisible()

  await test.step("the detail can be copied out, since the debug console can't be reached from here", async () => {
    await page
      .getByRole("button", { name: translate("en", "appError.copy") })
      .click()
    await expect(
      page.getByRole("button", { name: translate("en", "appError.copied") })
    ).toBeVisible()
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toContain("Simulated boot failure")
  })

  await test.step("the cache-clearing repair reloads without throwing", async () => {
    await page
      .getByRole("button", { name: translate("en", "appError.repair") })
      .click()
    // Still broken after the reload, so the card comes back — the point is
    // that the handler ran to completion and reloaded rather than dying
    // silently.
    await expect(
      page.getByText(translate("en", "appError.title"))
    ).toBeVisible()
  })
})
