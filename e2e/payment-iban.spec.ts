import {
  createPayment,
  expect,
  markIbanPaid,
  test,
  translate,
} from "./fixtures.ts"

test("pay with IBAN: renders a scannable bank QR in either format, then simulate the incoming payment", async ({
  seededPage: page,
}) => {
  await test.step("create a payment", () => createPayment(page, "en"))

  const qrButton = page.getByRole("button", {
    name: translate("en", "paymentWait.copyQr"),
  })

  await test.step("switch to the IBAN tab and verify the bank QR renders", async () => {
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.iban") })
      .click()
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

  await test.step("simulate the incoming bank payment", () =>
    markIbanPaid(page, "en"))

  await test.step("verify the paid confirmation is shown", async () => {
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible()
  })
})
