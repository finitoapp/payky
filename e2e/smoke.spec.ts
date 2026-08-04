import { expect, test } from "@playwright/test"
import {
  completeOnboarding,
  createPayment,
  markCashPaid,
  translate,
} from "./fixtures.ts"

// This is the one full end-to-end canary that exercises real onboarding
// through the UI (other specs use seedOnboarding() instead) end to end
// through a paid payment.
test("onboarding, cash payment, and marking paid", async ({ page }) => {
  await test.step("complete onboarding", () => completeOnboarding(page, "en"))
  await test.step("create a cash payment", () => createPayment(page, "en"))
  await test.step("mark the payment as paid", () => markCashPaid(page, "en"))

  await test.step("verify the paid confirmation is shown", async () => {
    await expect(
      page
        .getByTestId("payment-paid-panel")
        .getByText(translate("en", "paymentWait.paid"))
    ).toBeVisible()
  })
})
