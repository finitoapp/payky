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

test("pay with IBAN: bank details stay hidden until toggled, show the IBAN grouped in fours, and let the IBAN/VS be copied and the transfer confirmed manually", async ({
  seededPage: page,
}) => {
  // navigator.clipboard.writeText() otherwise silently hangs in Chromium
  // without an explicit permission grant, and the copy buttons' toasts never
  // fire either way.
  await page.context().grantPermissions(["clipboard-write"])

  const detailsToggle = page.getByRole("button", {
    name: translate("en", "paymentWait.ibanDetails.show"),
  })
  const ibanCopyButton = page.getByRole("button", {
    name: translate("en", "paymentWait.ibanDetails.iban.copy"),
  })

  await test.step("create a payment and switch to the IBAN tab", async () => {
    await createPayment(page, "en")
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.iban") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentWait.copyQr") })
      .locator("svg.size-full")
      .waitFor()
  })

  await test.step("bank details are hidden until the toggle is pressed", async () => {
    await expect(ibanCopyButton).not.toBeVisible()
    await expect(detailsToggle).toHaveAttribute("aria-pressed", "false")
    await detailsToggle.click()
    await expect(ibanCopyButton).toBeVisible()
  })

  await test.step("the IBAN is shown grouped in fours", async () => {
    await expect(page.getByText("CZ65 0800 0000 1920 0014 5399")).toBeVisible()
  })

  await test.step("the IBAN can be copied (in full, not the grouped display)", async () => {
    await ibanCopyButton.click()
    await expect(
      page.getByText(translate("en", "paymentWait.ibanDetails.iban.copied"))
    ).toBeVisible()
  })

  await test.step("the variable symbol can be copied", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "paymentWait.ibanDetails.variableSymbol.copy"),
      })
      .click()
    await expect(
      page.getByText(
        translate("en", "paymentWait.ibanDetails.variableSymbol.copied")
      )
    ).toBeVisible()
  })

  await test.step("toggling again hides the bank details", async () => {
    const hideToggle = page.getByRole("button", {
      name: translate("en", "paymentWait.ibanDetails.hide"),
    })
    await hideToggle.click()
    await expect(ibanCopyButton).not.toBeVisible()
  })

  await test.step("manually confirm the transfer was received", async () => {
    await page
      .getByRole("button", {
        name: translate("en", "paymentWait.ibanPaid.action"),
      })
      .click()
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible()
  })
})
