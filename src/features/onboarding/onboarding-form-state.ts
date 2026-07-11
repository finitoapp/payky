import { atom } from "jotai"

import type { FiatCurrency } from "@/core/modules/shared/schema.ts"

export type OnboardingStep = "language" | "currency" | "payments" | "account"
export type OnboardingPaymentMethod = "cash" | "btc" | "iban"

export const onboardingSteps: ReadonlyArray<OnboardingStep> = [
  "language",
  "currency",
  "payments",
  "account",
]

export interface OnboardingFormState {
  readonly step: OnboardingStep
  /** `null` until the user picks one; the UI derives a default from the language. */
  readonly currency: FiatCurrency | null
  readonly paymentMethods: ReadonlySet<OnboardingPaymentMethod>
  readonly iban: string
}

export const initialOnboardingFormState: OnboardingFormState = {
  step: "language",
  currency: null,
  paymentMethods: new Set(["cash", "btc"]),
  iban: "",
}

export const onboardingFormAtom = atom<OnboardingFormState>(
  initialOnboardingFormState
)
