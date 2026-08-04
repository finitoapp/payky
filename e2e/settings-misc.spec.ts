import {
  expect,
  gotoPage,
  reloadPage,
  test,
  translate,
  translateValue,
} from "./fixtures.ts"

test("configure tip presets", async ({ seededPage: page }) => {
  await test.step("open tips settings", () =>
    gotoPage(page, "/settings/tips", "en", "settings.tips.title"))

  const newPercentageLabel = translateValue(
    "en",
    "settings.tips.percentages.value",
    25
  )

  await test.step("add a percentage and a fixed amount preset", async () => {
    // The default percentage presets already fill maxTipPresetCount (4), so
    // remove one before adding a new one.
    const existingPercentageLabel = translateValue(
      "en",
      "settings.tips.percentages.value",
      20
    )
    await page
      .getByRole("button", {
        name: translateValue(
          "en",
          "settings.tips.preset.remove",
          existingPercentageLabel
        ),
      })
      .click()

    await page
      .getByRole("textbox", {
        name: translate("en", "settings.tips.percentages.label"),
      })
      .fill("25")
    await page
      .getByRole("button", {
        name: translate("en", "settings.tips.percentages.add"),
      })
      .click()
    await expect(
      page.getByText(newPercentageLabel, { exact: true })
    ).toBeVisible()

    await page
      .getByRole("textbox", {
        name: translate("en", "settings.tips.fixedAmounts.label"),
      })
      .fill("30.00")
    await page
      .getByRole("button", {
        name: translate("en", "settings.tips.fixedAmounts.add"),
      })
      .click()

    await page
      .getByRole("button", { name: translate("en", "settings.tips.save") })
      .click()
    await page.getByText(translate("en", "settings.tips.saved")).waitFor()
  })

  await test.step("verify the new presets persist after reload", async () => {
    await reloadPage(page, "en", "settings.tips.title")
    await expect(
      page.getByText(newPercentageLabel, { exact: true })
    ).toBeVisible()
  })

  await test.step("reset to default presets", async () => {
    await page
      .getByRole("button", { name: translate("en", "settings.tips.reset") })
      .click()
    await expect(
      page.getByText(newPercentageLabel, { exact: true })
    ).toHaveCount(0)
  })
})

test("switch the default fiat currency", async ({ seededPage: page }) => {
  await test.step("open fiat currency settings", () =>
    gotoPage(page, "/settings/fiat", "en", "settings.fiat.title"))

  const czkOption = page.getByRole("button", {
    name: translate("en", "settings.fiat.czk.title"),
  })

  await test.step("select Czech koruna", async () => {
    await czkOption.click()
    await expect(czkOption).toHaveAttribute("aria-pressed", "true")
  })

  await test.step("verify the selection persists after reload", async () => {
    await reloadPage(page, "en", "settings.fiat.title")
    await expect(czkOption).toHaveAttribute("aria-pressed", "true")
  })
})

test("edit the payment number series", async ({ seededPage: page }) => {
  await test.step("open payment number series settings", () =>
    gotoPage(
      page,
      "/settings/payment-number-series",
      "en",
      "settings.paymentNumberSeries.title"
    ))

  await test.step("set a prefix and save the series format", async () => {
    await page
      .getByRole("textbox", {
        name: translate("en", "settings.paymentNumberSeries.prefix.label"),
      })
      .fill("INV-")
    await page
      .getByRole("button", {
        name: translate("en", "settings.paymentNumberSeries.save"),
      })
      .click()
    await page
      .getByText(translate("en", "settings.paymentNumberSeries.saved"))
      .waitFor()
  })

  await test.step("update the last used number and save", async () => {
    await page
      .getByRole("textbox", {
        name: translate(
          "en",
          "settings.paymentNumberSeries.lastNumber.serialNumber.label"
        ),
      })
      .fill("42")
    await page
      .getByRole("button", {
        name: translate("en", "settings.paymentNumberSeries.lastNumber.save"),
      })
      .click()
    await page
      .getByText(
        translate("en", "settings.paymentNumberSeries.lastNumber.saved")
      )
      .waitFor()
  })

  await test.step("verify both changes persist after reload", async () => {
    await reloadPage(page, "en", "settings.paymentNumberSeries.title")
    await expect(
      page.getByRole("textbox", {
        name: translate("en", "settings.paymentNumberSeries.prefix.label"),
      })
    ).toHaveValue("INV-")
    await expect(
      page.getByRole("textbox", {
        name: translate(
          "en",
          "settings.paymentNumberSeries.lastNumber.serialNumber.label"
        ),
      })
    ).toHaveValue("42")
  })
})
