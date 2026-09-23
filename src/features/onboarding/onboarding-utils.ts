import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import type {
  OnboardingCountryChoice,
  OnboardingPaymentMethod,
} from "@/features/onboarding/onboarding-form-state.ts"
import type { Language } from "@/i18n/resources.ts"

/**
 * The country's default, until the merchant picks one: the language they
 * read the wizard in is the only signal available this early, and it is a
 * good one for the two countries Payky ships tax presets for. Anyone else
 * starts on "other" rather than on a country that would seed wrong rates.
 */
export const getDefaultCountryForLanguage = (
  language: Language
): OnboardingCountryChoice => {
  if (language === "cs") {
    return "CZ"
  }

  if (language === "sk") {
    return "SK"
  }

  return "OTHER"
}

/**
 * The currency's default: derived from the country, not straight from the
 * UI language, so picking a country explicitly overrides what the language
 * implied. See `finishOnboarding` for the device locale (number/money
 * formatting), which is derived from language instead.
 */
export const getDefaultCurrencyForCountry = (
  country: OnboardingCountryChoice | null
): FiatCurrencyType => {
  if (country === "CZ") {
    return FiatCurrency.CZK
  }

  if (country === "SK") {
    return FiatCurrency.EUR
  }

  return FiatCurrency.USD
}

/**
 * The order the payment-method tabs appear in on the payment screen, derived
 * from what the merchant enabled here. Methods left off are simply absent —
 * `parsePaymentMethodOrder` treats an unlisted method as unavailable.
 */
export function getPaymentMethodOrder(
  paymentMethods: ReadonlySet<OnboardingPaymentMethod>
): ReadonlyArray<DefaultPaymentMethod> {
  const order: DefaultPaymentMethod[] = []

  if (paymentMethods.has("iban")) {
    order.push("iban")
  }

  if (paymentMethods.has("cash")) {
    order.push("cashRegister")
  }

  if (paymentMethods.has("btc")) {
    order.push("spark")
  }

  return order
}

/**
 * Which tab opens first. Independent of `getPaymentMethodOrder`: the default
 * falls back to `iban` even when no method is enabled, so the setting always
 * decodes to a valid `DefaultPaymentMethod`.
 */
export function getDefaultPaymentMethodForOnboarding(
  paymentMethods: ReadonlySet<OnboardingPaymentMethod>
): DefaultPaymentMethod {
  if (paymentMethods.has("btc")) return "spark"
  if (paymentMethods.has("cash")) return "cashRegister"
  return "iban"
}
