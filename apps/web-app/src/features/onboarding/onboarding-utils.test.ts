import {
  getPaymentMethodOrder,
  PaymentMethodOrderJson,
} from "@payky/core/modules/app-settings/app-settings-utils"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { onboardingPaymentMethodOrder } from "./onboarding-utils.ts"

describe("onboarding payment method order", () => {
  test("keeps bank transfer and card before Spark and Cashu after reading settings", () => {
    const order = getPaymentMethodOrder({
      paymentMethodOrderJson: z.encode(
        PaymentMethodOrderJson,
        onboardingPaymentMethodOrder
      ),
      defaultPaymentMethod: onboardingPaymentMethodOrder[0],
    })
    expect(order).toEqual([
      "iban",
      "cardSwitchio",
      "spark",
      "cashu",
      "cashRegister",
    ])
  })
})
