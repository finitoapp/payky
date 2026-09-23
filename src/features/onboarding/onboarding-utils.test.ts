import { describe, expect, test } from "vitest"

import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import type { OnboardingPaymentMethod } from "@/features/onboarding/onboarding-form-state.ts"
import {
  getDefaultCountryForLanguage,
  getDefaultCurrencyForCountry,
  getDefaultPaymentMethodForOnboarding,
  getPaymentMethodOrder,
} from "@/features/onboarding/onboarding-utils.ts"

const methods = (...values: ReadonlyArray<OnboardingPaymentMethod>) =>
  new Set(values)

describe("getDefaultCountryForLanguage", () => {
  test("maps each localized language to its own country", () => {
    expect(getDefaultCountryForLanguage("cs")).toBe("CZ")
    expect(getDefaultCountryForLanguage("sk")).toBe("SK")
  })

  test("leaves every other language on 'other'", () => {
    expect(getDefaultCountryForLanguage("en")).toBe("OTHER")
  })

  test("chains into a currency: Czech reads in CZK, English in USD", () => {
    expect(
      getDefaultCurrencyForCountry(getDefaultCountryForLanguage("cs"))
    ).toBe(FiatCurrency.CZK)
    expect(
      getDefaultCurrencyForCountry(getDefaultCountryForLanguage("en"))
    ).toBe(FiatCurrency.USD)
  })
})

describe("getDefaultCurrencyForCountry", () => {
  test("maps the two supported countries to their own currency", () => {
    expect(getDefaultCurrencyForCountry("CZ")).toBe(FiatCurrency.CZK)
    expect(getDefaultCurrencyForCountry("SK")).toBe(FiatCurrency.EUR)
  })

  test("falls back to USD for 'other' and for no choice yet", () => {
    expect(getDefaultCurrencyForCountry("OTHER")).toBe(FiatCurrency.USD)
    expect(getDefaultCurrencyForCountry(null)).toBe(FiatCurrency.USD)
  })
})

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
