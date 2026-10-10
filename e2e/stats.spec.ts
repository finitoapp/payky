import type { Page } from "@playwright/test"

import { turnOnAccessControl } from "./support/access.ts"
import { expect, test } from "./support/fixtures.ts"
import { translate } from "./support/i18n.ts"

const statsLock = (page: Page) =>
  page.getByRole("heading", {
    name: translate("en", "access.pin.why.route").replace(
      "{permission}",
      translate("en", "access.permission.stats")
    ),
  })

const statsHeading = (page: Page) =>
  page.getByRole("heading", {
    name: translate("en", "stats.title"),
    exact: true,
  })

test("a Basic device opening the statistics gets the PIN prompt", async ({
  seededPage: page,
}) => {
  await test.step("turn access control on, this device set to Basic", () =>
    turnOnAccessControl(page, "en"))

  await test.step("the statistics ask for the PIN", async () => {
    await page.goto("/stats", { waitUntil: "domcontentloaded" })
    await expect(statsLock(page)).toBeVisible()
    await expect(statsHeading(page)).toHaveCount(0)
  })
})

test("a Manager device opens the statistics without the PIN", async ({
  seededPage: page,
}) => {
  await test.step("turn access control on, this device set to Manager", () =>
    turnOnAccessControl(page, "en", { preset: "manager" }))

  await test.step("the statistics open from the home header", async () => {
    // A reload drops the PIN session the wizard started.
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", { name: translate("en", "nav.stats") })
      .click()
    await expect(statsHeading(page)).toBeVisible()
    await expect(statsLock(page)).toHaveCount(0)
  })
})
