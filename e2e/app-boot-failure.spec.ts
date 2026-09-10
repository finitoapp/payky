import { expect, test, translate } from "./fixtures.ts"

test("a crash while booting the app singletons shows the error card, not a stuck spinner", async ({
  seededPage: page,
}) => {
  // Stands in for the real boot failures — OPFS or worker unavailable in a
  // legacy WebView, a PWA cache serving index.html without its worker
  // chunk, a corrupted database. All of them surface the same way: the
  // Evolu client's Task throws where the app singletons are created.
  await page.addInitScript(() => {
    window.SharedWorker = class {
      constructor() {
        throw new Error("Simulated boot failure")
      }
    } as unknown as typeof SharedWorker
  })

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
    page.getByRole("button", { name: translate("en", "appError.reload") })
  ).toBeVisible()
})
