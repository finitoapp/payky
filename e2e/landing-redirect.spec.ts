import type { Page } from "@playwright/test"
import { expect, test } from "./support/fixtures.ts"

import { translate } from "./support/i18n.ts"

/** Opens a group's menu, retrying until the prerendered page has hydrated. */
const chooseWayIn = async (
  page: Page,
  language: "cs" | "en" | "sk",
  group: "native" | "webBased",
  option: "zapstore" | "apk" | "install" | "web"
) => {
  const item = page.getByRole("menuitem", {
    name: translate(language, `landing.closing.get.${option}.label`),
  })
  await expect(async () => {
    await page
      .getByRole("button", {
        name: translate(language, `landing.closing.get.${group}.action`),
      })
      .click()
    await expect(item).toBeVisible({ timeout: 1000 })
  }).toPass()
  return item
}

test("a new browser visitor lands on the landing page until they open the app", async ({
  page,
}) => {
  await test.step("the app's address shows the Czech landing page, whatever the browser's language", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL("/landing")
  })

  await test.step("the landing page opens onboarding", async () => {
    await (await chooseWayIn(page, "cs", "webBased", "web")).click()
    await expect(
      page.getByRole("heading", { name: translate("cs", "onboarding.title") })
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

test("switching the landing page's language moves to that language's page", async ({
  page,
}) => {
  await page.goto("/landing/en", { waitUntil: "domcontentloaded" })
  await page
    .getByRole("button", { name: translate("en", "landing.language.label") })
    .click()
  await page.getByRole("menuitemradio", { name: "Čeština" }).click()

  await expect(page).toHaveURL("/landing")
  await expect(
    page.getByRole("heading", { name: translate("cs", "landing.faq.title") })
  ).toBeVisible()

  await test.step("and the app's address remembers it", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL("/landing")
  })
})

test("the app starts in the language of the landing page it was opened from", async ({
  page,
}) => {
  await page.goto("/landing", { waitUntil: "domcontentloaded" })
  await (await chooseWayIn(page, "cs", "webBased", "web")).click()

  await expect(
    page.getByRole("heading", { name: translate("cs", "onboarding.title") })
  ).toBeVisible()
  await expect(page).toHaveURL("/onboarding")

  await test.step("and keeps it on the app's address", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(
      page.getByRole("heading", { name: translate("cs", "onboarding.title") })
    ).toBeVisible()
  })
})

test("a device with an account keeps its language when opened from the landing page", async ({
  seededPage: page,
}) => {
  await page.goto("/landing", { waitUntil: "domcontentloaded" })
  await (await chooseWayIn(page, "cs", "webBased", "web")).click()

  await expect(page).toHaveURL("/")
  await expect(
    page.getByRole("button", { name: translate("en", "settings.title") })
  ).toBeVisible()
})

const pretendInstalled = `
  const matchMedia = window.matchMedia.bind(window)
  window.matchMedia = (query) =>
    query === "(display-mode: standalone)"
      ? { matches: true, media: query }
      : matchMedia(query)
`

test("the landing page installs the app, which starts in the page's language", async ({
  page,
}) => {
  await page.goto("/landing/sk", { waitUntil: "domcontentloaded" })

  await test.step("the browser's own install offer opens from the menu", async () => {
    await page.evaluate(() => {
      const offer = Object.assign(
        new Event("beforeinstallprompt", { cancelable: true }),
        {
          prompt: async () => {
            dispatchEvent(new Event("appinstalled"))
          },
        }
      )
      dispatchEvent(offer)
    })
    await (await chooseWayIn(page, "sk", "webBased", "install")).click()
    await expect(
      page.getByText(translate("sk", "landing.closing.get.install.done"))
    ).toBeVisible()
  })

  await test.step("the installed app opens onboarding in Slovak", async () => {
    await page.addInitScript({ content: pretendInstalled })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(
      page.getByRole("heading", { name: translate("sk", "onboarding.title") })
    ).toBeVisible()
  })
})

test("an installed app that starts on the landing page goes to onboarding in its language", async ({
  page,
}) => {
  await page.addInitScript({ content: pretendInstalled })
  await page.goto("/landing/sk", { waitUntil: "domcontentloaded" })

  await expect(
    page.getByRole("heading", { name: translate("sk", "onboarding.title") })
  ).toBeVisible()
})

test("the native app comes from Zapstore or as the newest APK", async ({
  page,
}) => {
  await page.goto("/landing/en", { waitUntil: "domcontentloaded" })

  await expect(
    await chooseWayIn(page, "en", "native", "zapstore")
  ).toHaveAttribute("href", "https://zapstore.dev/apps/me.payky")
  await expect(
    page.getByRole("menuitem", {
      name: translate("en", "landing.closing.get.apk.label"),
    })
  ).toHaveAttribute(
    "href",
    "https://github.com/finitoapp/payky/releases/latest/download/app-release-signed.apk"
  )
})

test("without the browser's install offer, the landing page says how to install by hand", async ({
  page,
}) => {
  await page.goto("/landing/en", { waitUntil: "domcontentloaded" })
  await (await chooseWayIn(page, "en", "webBased", "install")).click()

  await expect(
    page.getByText(translate("en", "landing.closing.get.install.manual"))
  ).toBeVisible()
})

test("the landing page's start buttons open the app in its language", async ({
  page,
}) => {
  await page.goto("/landing/sk", { waitUntil: "domcontentloaded" })

  for (const [name, exact] of [
    [translate("sk", "landing.cta.start"), false],
    [translate("sk", "landing.cta.startShort"), true],
  ] as const) {
    await expect(page.getByRole("link", { name, exact })).toHaveAttribute(
      "href",
      "/onboarding?lang=sk"
    )
  }

  await page
    .getByRole("link", { name: translate("sk", "landing.cta.start") })
    .click()
  await expect(
    page.getByRole("heading", { name: translate("sk", "onboarding.title") })
  ).toBeVisible()
})
