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

  await test.step("pick a percentage tip, which confirms immediately", async () => {
    await page
      .getByRole("button", {
        name: translateValue("en", "settings.tips.percentages.value", 10),
      })
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

test("there is no confirm button until a custom tip is being entered", async ({
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

  const continueButton = page.getByRole("button", {
    name: translate("en", "paymentTip.continue"),
  })

  await test.step("no confirm button is shown before picking a tip", async () => {
    await expect(continueButton).not.toBeVisible()
  })

  await test.step("picking the custom tip tile reveals the confirm button", async () => {
    await page
      .getByRole("button", { name: translate("en", "paymentTip.custom.label") })
      .click()
    await expect(continueButton).toBeVisible()
    await expect(continueButton).toBeDisabled()
  })
})

test("charge with a custom tip amount, confirmed via its own button", async ({
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

  await test.step("enter a custom tip amount and confirm", async () => {
    await page
      .getByRole("button", { name: translate("en", "paymentTip.custom.label") })
      .click()
    await page
      .getByRole("textbox", {
        name: translate("en", "paymentTip.custom.label"),
      })
      .fill("2.50")
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

  await test.step("choose no tip, which confirms immediately", async () => {
    await page
      .getByRole("button", { name: translate("en", "paymentTip.none") })
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
