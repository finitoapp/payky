import {
  enterAmount,
  expect,
  markCashPaid,
  test,
  translate,
  translateValue,
} from "./fixtures.ts"

test("charge with a percentage tip preset then mark cash paid", async ({
  seededPage: page,
}) => {
  await test.step("enter an amount and go to the tip step", async () => {
    await enterAmount(page, "en")
    await page
      .getByRole("button", { name: translate("en", "home.pay") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentTip.title") })
      .waitFor()
  })

  await test.step("pick a percentage tip and continue", async () => {
    await page
      .getByRole("button", {
        name: translateValue("en", "settings.tips.percentages.value", 10),
      })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentTip.continue") })
      .click()
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.iban") })
      .waitFor()
  })

  await test.step("mark the payment as paid", () => markCashPaid(page, "en"))

  await test.step("verify the paid confirmation is shown", async () => {
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible()
  })
})

test("charge with no tip then mark cash paid", async ({ seededPage: page }) => {
  await test.step("enter an amount and go to the tip step", async () => {
    await enterAmount(page, "en")
    await page
      .getByRole("button", { name: translate("en", "home.pay") })
      .click()
    await page
      .getByRole("heading", { name: translate("en", "paymentTip.title") })
      .waitFor()
  })

  await test.step("choose no tip and continue", async () => {
    await page
      .getByRole("button", { name: translate("en", "paymentTip.none") })
      .click()
    await page
      .getByRole("button", { name: translate("en", "paymentTip.continue") })
      .click()
    await page
      .getByRole("tab", { name: translate("en", "paymentWait.method.iban") })
      .waitFor()
  })

  await test.step("mark the payment as paid", () => markCashPaid(page, "en"))

  await test.step("verify the paid confirmation is shown", async () => {
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible()
  })
})
