import { describe, expect, test } from "vitest"
import { z } from "zod"

import {
  getPaymentMethodOrder,
  PaymentMethodOrderJson,
} from "@/core/modules/app-settings/app-settings-utils.ts"
import type { OnboardingPaymentMethod } from "@/features/onboarding/onboarding-form-state.ts"
import {
  getDefaultPaymentMethodForOnboarding,
  onboardingPaymentMethodOrder,
} from "@/features/onboarding/onboarding-utils.ts"

const methods = (...values: ReadonlyArray<OnboardingPaymentMethod>) =>
  new Set(values)

/** The order the payment screen shows after onboarding with `enabled`. */
const orderAfterOnboarding = (enabled: ReadonlySet<OnboardingPaymentMethod>) =>
  getPaymentMethodOrder({
    paymentMethodOrderJson: z.encode(
      PaymentMethodOrderJson,
      onboardingPaymentMethodOrder
    ),
    defaultPaymentMethod: getDefaultPaymentMethodForOnboarding(enabled),
  })

describe("onboarding payment method order", () => {
  test("offers bank transfer, card, bitcoin, cash", () => {
    expect(orderAfterOnboarding(methods("cash", "btc", "iban"))).toEqual([
      "iban",
      "cardSwitchio",
      "spark",
      "cashRegister",
      // Unlisted by onboarding, so appended: Cashu is enabled in settings.
      "cashu",
    ])
  })

  test("opens on the first enabled method when bank transfer is off", () => {
    expect(getDefaultPaymentMethodForOnboarding(methods("cash", "btc"))).toBe(
      "spark"
    )
    expect(getDefaultPaymentMethodForOnboarding(methods("cash"))).toBe(
      "cashRegister"
    )
  })

  test("still decodes to a valid method when nothing is enabled", () => {
    expect(getDefaultPaymentMethodForOnboarding(methods())).toBe("iban")
  })
})
