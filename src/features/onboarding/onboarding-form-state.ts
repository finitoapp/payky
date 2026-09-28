import { atom } from "jotai"

import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"

export type OnboardingStep =
  | "accountChoice"
  | "countryCurrency"
  | "payments"
  | "account"
  | "restore"
/**
 * `existingMnemonic` sets up a restored phrase whose relays had no account
 * data (see the restore sync page): the account is already chosen and its
 * phrase already backed up, so it skips both the choice and the backup step.
 */
export type OnboardingAccountType = "new" | "restore" | "existingMnemonic"
export type OnboardingPaymentMethod = "cash" | "btc" | "iban"
/**
 * The onboarding country step's own 3-way choice. Unlike the persisted
 * `legalEntity.country` (`CountryCode | null`, where `null` means "other"),
 * this form-local type keeps "other" as an explicit value distinct from
 * "not chosen yet" (`OnboardingFormState.country: OnboardingCountryChoice |
 * null`), which is what lets the country keep following the UI language until
 * the merchant picks one (see `getDefaultCountryForLanguage`). Translate
 * `"OTHER"` to `null` only when calling `setLegalEntity`.
 */
export type OnboardingCountryChoice = CountryCode | "OTHER"

const onboardingStepsByAccountType = {
  new: ["accountChoice", "countryCurrency", "payments", "account"],
  restore: ["accountChoice", "restore"],
  existingMnemonic: ["countryCurrency", "payments"],
} satisfies Record<OnboardingAccountType, ReadonlyArray<OnboardingStep>>

export const getOnboardingSteps = (
  accountType: OnboardingAccountType | null
): ReadonlyArray<OnboardingStep> =>
  onboardingStepsByAccountType[accountType ?? "new"]

interface OnboardingFormState {
  readonly step: OnboardingStep
  readonly accountType: OnboardingAccountType | null
  /** `null` until the user picks one; the UI derives a default from the language. */
  readonly currency: FiatCurrency | null
  readonly paymentMethods: ReadonlySet<OnboardingPaymentMethod>
  readonly iban: string
  /** `null` until the user picks one; until then it follows the UI language. */
  readonly country: OnboardingCountryChoice | null
  /**
   * Whether the user has checked the "I've saved my recovery phrase" box on
   * the account step. Gates `onboarding.finish` so the wizard can't be
   * completed without at least acknowledging the phrase is the only backup.
   */
  readonly recoveryPhraseConfirmed: boolean
}

export const initialOnboardingFormState: OnboardingFormState = {
  step: "accountChoice",
  accountType: null,
  currency: null,
  paymentMethods: new Set(["cash", "btc", "iban"]),
  iban: "",
  country: null,
  recoveryPhraseConfirmed: false,
}

export const onboardingFormAtom = atom<OnboardingFormState>(
  initialOnboardingFormState
)
