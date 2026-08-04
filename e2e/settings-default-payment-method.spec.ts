import { expect, gotoPage, reloadPage, test, translate } from "./fixtures.ts"

test("change the default checkout payment method", async ({
  seededPage: page,
}) => {
  await test.step("open default payment method settings", () =>
    gotoPage(
      page,
      "/settings/default-payment-method",
      "en",
      "settings.defaultPaymentMethod.title"
    ))

  const ibanOption = page.getByRole("button", {
    name: translate("en", "settings.defaultPaymentMethod.iban.title"),
  })

  await test.step("switch the default method to IBAN", async () => {
    await ibanOption.click()
    await page
      .getByText(translate("en", "settings.defaultPaymentMethod.saved"))
      .waitFor()
    await expect(ibanOption).toHaveAttribute("aria-pressed", "true")
  })

  await test.step("verify the selection persists after reload", async () => {
    await reloadPage(page, "en", "settings.defaultPaymentMethod.title")
    await expect(ibanOption).toHaveAttribute("aria-pressed", "true")
  })
})
