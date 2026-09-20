import { atom } from "jotai"

import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"

export type OnboardingStep =
  | "language"
  | "accountChoice"
  | "country"
  | "currency"
  | "payments"
  | "account"
  | "restore"
export type OnboardingAccountType = "new" | "restore"
export type OnboardingPaymentMethod = "cash" | "btc" | "cashu" | "iban"
/**
 * The onboarding country step's own 3-way choice. Unlike the persisted
 * `legalEntity.country` (`CountryCode | null`, where `null` means "other"),
 * this form-local type keeps "other" as an explicit value distinct from
 * "not chosen yet" (`OnboardingFormState.country: OnboardingCountryChoice |
 * null`) so the step's "Next" button can gate on an actual choice. Translate
 * `"OTHER"` to `null` only when calling `setLegalEntity`.
 */
export type OnboardingCountryChoice = CountryCode | "OTHER"

const newAccountOnboardingSteps: ReadonlyArray<OnboardingStep> = [
  "language",
  "accountChoice",
  "country",
  "currency",
  "payments",
  "account",
]

const restoreAccountOnboardingSteps: ReadonlyArray<OnboardingStep> = [
  "language",
  "accountChoice",
  "restore",
]

/**
 * Setting up an account whose phrase was restored but never used in Payky:
 * the language was already chosen on the way here, the account itself exists
 * and its recovery phrase is the one the user typed, so there is nothing to
 * choose, generate or confirm — only the terminal's own settings remain.
 */
const restoredAccountSetupSteps: ReadonlyArray<OnboardingStep> = [
  "country",
  "currency",
  "payments",
]

export const getOnboardingSteps = ({
  accountType,
  restoredAccountSetup,
}: {
  readonly accountType: OnboardingAccountType | null
  readonly restoredAccountSetup: boolean
}): ReadonlyArray<OnboardingStep> => {
  if (restoredAccountSetup) return restoredAccountSetupSteps
  return accountType === "restore"
    ? restoreAccountOnboardingSteps
    : newAccountOnboardingSteps
}

export const initialOnboardingStep = (
  restoredAccountSetup: boolean
): OnboardingStep => (restoredAccountSetup ? "country" : "language")

interface OnboardingFormState {
  readonly step: OnboardingStep
  readonly accountType: OnboardingAccountType | null
  /** `null` until the user picks one; the UI derives a default from the language. */
  readonly currency: FiatCurrency | null
  readonly paymentMethods: ReadonlySet<OnboardingPaymentMethod>
  readonly iban: string
  /** `null` until the user picks one on the country step. */
  readonly country: OnboardingCountryChoice | null
  /** `null` until the user answers the VAT-payer question; treated as "not a VAT payer". */
  readonly vatPayer: boolean | null
  /**
   * Whether the user has checked the "I've saved my recovery phrase" box on
   * the account step. Gates `onboarding.finish` so the wizard can't be
   * completed without at least acknowledging the phrase is the only backup.
   */
  readonly recoveryPhraseConfirmed: boolean
}

export const initialOnboardingFormState: OnboardingFormState = {
  step: "language",
  accountType: null,
  currency: null,
  paymentMethods: new Set(["cash", "btc"]),
  iban: "",
  country: null,
  vatPayer: null,
  recoveryPhraseConfirmed: false,
}

export const onboardingFormAtom = atom<OnboardingFormState>(
  initialOnboardingFormState
)
