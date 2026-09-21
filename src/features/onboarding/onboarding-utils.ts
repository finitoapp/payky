import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import type { OnboardingPaymentMethod } from "@/features/onboarding/onboarding-form-state.ts"

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
 * Which tab opens first: bank transfer when the merchant enabled it, else
 * the first enabled method in tab order. Falls back to `iban` even when no
 * method is enabled, so the setting always decodes to a valid
 * `DefaultPaymentMethod`.
 */
export function getDefaultPaymentMethodForOnboarding(
  paymentMethods: ReadonlySet<OnboardingPaymentMethod>
): DefaultPaymentMethod {
  return getPaymentMethodOrder(paymentMethods)[0] ?? "iban"
}
