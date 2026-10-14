import { describe, expect, test } from "vitest"

import type { OnboardingPaymentMethod } from "@/features/onboarding/onboarding-form-state.ts"
import {
  getDefaultPaymentMethodForOnboarding,
  getPaymentMethodOrder,
} from "@/features/onboarding/onboarding-utils.ts"

const methods = (...values: ReadonlyArray<OnboardingPaymentMethod>) =>
  new Set(values)

describe("getPaymentMethodOrder", () => {
  test("orders enabled methods iban, cash, btc regardless of set order", () => {
    expect(getPaymentMethodOrder(methods("btc", "iban", "cash"))).toEqual([
      "iban",
      "cashRegister",
      "spark",
    ])
    expect(getPaymentMethodOrder(methods("cash", "btc"))).toEqual([
      "cashRegister",
      "spark",
    ])
  })

  test("omits methods the merchant did not enable", () => {
    expect(getPaymentMethodOrder(methods("iban"))).toEqual(["iban"])
    expect(getPaymentMethodOrder(methods())).toEqual([])
  })
})

describe("getDefaultPaymentMethodForOnboarding", () => {
  test("prefers btc, then cash, then iban", () => {
    expect(
      getDefaultPaymentMethodForOnboarding(methods("btc", "cash", "iban"))
    ).toBe("spark")
    expect(getDefaultPaymentMethodForOnboarding(methods("cash", "iban"))).toBe(
      "cashRegister"
    )
    expect(getDefaultPaymentMethodForOnboarding(methods("iban"))).toBe("iban")
  })

  test("still decodes to a valid method when nothing is enabled", () => {
    expect(getDefaultPaymentMethodForOnboarding(methods())).toBe("iban")
  })
})
