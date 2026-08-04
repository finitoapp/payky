import { createPayment, expect, test, translate } from "./fixtures.ts"

test("selecting the IBAN method renders a scannable bank QR", async ({
  seededPage: page,
}) => {
  await test.step("create a payment", () => createPayment(page, "en"))

  await test.step("switch to the IBAN tab", async () => {
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.iban") })
      .click()
  })

  const qrButton = page.getByRole("button", {
    name: translate("en", "paymentWait.copyQr"),
  })

  await test.step("verify the bank QR code renders", async () => {
    await expect(qrButton).toBeEnabled()
    await expect(qrButton.locator("svg")).toBeVisible()
  })

  await test.step("switch QR formats", async () => {
    const payBySquareFormat = page.getByRole("button", {
      name: translate("en", "paymentWait.qrFormat.payBySquare1_0_0"),
    })
    await payBySquareFormat.click()
    await expect(payBySquareFormat).toHaveAttribute("aria-pressed", "true")
    await expect(qrButton.locator("svg")).toBeVisible()
  })
})
