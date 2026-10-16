import type { DefaultPaymentMethod } from "@payky/core/modules/app-settings/app-settings-types"

/** Stored for every new account; only enabled methods appear during payment. */
export const onboardingPaymentMethodOrder = [
  "iban",
  "cardSwitchio",
  "spark",
  "cashu",
  "cashRegister",
] as const satisfies ReadonlyArray<DefaultPaymentMethod>
