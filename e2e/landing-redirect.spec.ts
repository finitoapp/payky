import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"

test("a new browser visitor lands on the landing page until they open the app", async ({
  page,
}) => {
  await test.step("the app's address shows the landing page", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL("/landing")
  })

  await test.step("the landing page opens onboarding", async () => {
    await page
      .getByRole("link", {
        name: translate("en", "landing.closing.get.pwa.action"),
      })
      .click()
    await expect(
      page.getByRole("heading", { name: translate("en", "onboarding.title") })
    ).toBeVisible()
  })

  await test.step("the app's address now goes to onboarding", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL("/onboarding")
  })
})

test("an installed PWA without an account goes straight to onboarding", async ({
  page,
}) => {
  await page.addInitScript({
    content: `
      const matchMedia = window.matchMedia.bind(window)
      window.matchMedia = (query) =>
        query === "(display-mode: standalone)"
          ? { matches: true, media: query }
          : matchMedia(query)
    `,
  })

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL("/onboarding")
})
