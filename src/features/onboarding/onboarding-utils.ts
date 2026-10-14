import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import type { OnboardingPaymentMethod } from "@/features/onboarding/onboarding-form-state.ts"

/**
 * The order the payment-method tabs appear in on the payment screen, the same
 * for every new account whatever it enabled: `parsePaymentMethodOrder`
 * appends any unlisted method anyway, and whether a method is offered at all
 * comes from its account being enabled, not from this list.
 */
export const onboardingPaymentMethodOrder: ReadonlyArray<DefaultPaymentMethod> =
  ["iban", "cardSwitchio", "spark", "cashRegister"]

const onboardingMethodByPaymentMethod: Partial<
  Record<DefaultPaymentMethod, OnboardingPaymentMethod>
> = { iban: "iban", spark: "btc", cashRegister: "cash" }

/**
 * Which tab opens first: the first enabled method in
 * `onboardingPaymentMethodOrder`, because `getPaymentMethodOrder` in
 * app-settings moves the default to the front. Falls back to `iban` when no
 * method is enabled, so the setting always decodes to a valid
 * `DefaultPaymentMethod`.
 */
export function getDefaultPaymentMethodForOnboarding(
  paymentMethods: ReadonlySet<OnboardingPaymentMethod>
): DefaultPaymentMethod {
  return (
    onboardingPaymentMethodOrder.find((method) => {
      const onboardingMethod = onboardingMethodByPaymentMethod[method]
      return (
        onboardingMethod !== undefined && paymentMethods.has(onboardingMethod)
      )
    }) ?? "iban"
  )
}
