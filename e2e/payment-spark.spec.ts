import {
  createPayment,
  expect,
  markSparkPaid,
  prepareSparkPayment,
  seedOnboarding,
  test,
  translate,
} from "./fixtures.ts"

test("pay with Spark then simulate the incoming payment", async ({ page }) => {
  // Preparing a real Spark Lightning invoice is a network round trip to the
  // Spark wallet SDK, slower than the other payment methods.
  test.setTimeout(60_000)

  await test.step("onboard with Spark enabled", () =>
    seedOnboarding(page, "en", { spark: true }))

  await test.step("create a payment", () => createPayment(page, "en"))

  await test.step("select the Lightning tab and wait for the invoice", () =>
    prepareSparkPayment(page, "en"))

  await test.step("simulate the incoming Spark payment", () =>
    markSparkPaid(page, "en"))

  await test.step("verify the paid confirmation is shown", async () => {
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible()
  })
})
