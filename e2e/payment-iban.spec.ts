import {
  createPayment,
  expect,
  markIbanPaid,
  prepareIbanPayment,
  test,
  translate,
} from "./fixtures.ts"

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

test("pay with IBAN then simulate the incoming bank payment", async ({
  seededPage: page,
}) => {
  await test.step("create a payment", () => createPayment(page, "en"))

  await test.step("select the IBAN tab and wait for the bank QR", () =>
    prepareIbanPayment(page, "en"))

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
