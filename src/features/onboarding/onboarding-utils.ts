import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import type {
  OnboardingCountryChoice,
  OnboardingPaymentMethod,
} from "@/features/onboarding/onboarding-form-state.ts"

/**
 * The currency step's default: derived from the country chosen on the
 * previous step, not the UI language, so a Czech merchant who reads the
 * wizard in English still lands on CZK. See `finishOnboarding` for the
 * device locale (number/money formatting), which is derived from language
 * instead — the two are deliberately independent.
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

  if (paymentMethods.has("cashu")) {
    order.push("cashu")
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
  if (paymentMethods.has("cashu")) return "cashu"
  if (paymentMethods.has("cash")) return "cashRegister"
  return "iban"
}
