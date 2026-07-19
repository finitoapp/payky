import { atom } from "jotai"

import type { FiatCurrency } from "@/core/modules/shared/schema.ts"

export type OnboardingStep =
  | "language"
  | "accountChoice"
  | "currency"
  | "payments"
  | "account"
  | "restore"
export type OnboardingAccountType = "new" | "restore"
export type OnboardingPaymentMethod = "cash" | "btc" | "iban"

const newAccountOnboardingSteps: ReadonlyArray<OnboardingStep> = [
  "language",
  "accountChoice",
  "currency",
  "payments",
  "account",
]

const restoreAccountOnboardingSteps: ReadonlyArray<OnboardingStep> = [
  "language",
  "accountChoice",
  "restore",
]

export const getOnboardingSteps = (
  accountType: OnboardingAccountType | null
): ReadonlyArray<OnboardingStep> =>
  accountType === "restore"
    ? restoreAccountOnboardingSteps
    : newAccountOnboardingSteps

export interface OnboardingFormState {
  readonly step: OnboardingStep
  readonly accountType: OnboardingAccountType | null
  /** `null` until the user picks one; the UI derives a default from the language. */
  readonly currency: FiatCurrency | null
  readonly paymentMethods: ReadonlySet<OnboardingPaymentMethod>
  readonly iban: string
}

export const initialOnboardingFormState: OnboardingFormState = {
  step: "language",
  accountType: null,
  currency: null,
  paymentMethods: new Set(["cash", "btc"]),
  iban: "",
}

export const onboardingFormAtom = atom<OnboardingFormState>(
  initialOnboardingFormState
)
