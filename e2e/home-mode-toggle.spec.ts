import { expect, seedOnboarding, test, translate } from "./fixtures.ts"

test("toggling the home icon switches between numpad and tables, and the choice survives a reload", async ({
  page,
}) => {
  await seedOnboarding(page, "en")

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
