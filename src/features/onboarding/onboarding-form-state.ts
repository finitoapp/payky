import { atom } from "jotai"

export type OnboardingStep =
  | "accountChoice"
  | "payments"
  | "restore"
  | "transfer"
/**
 * `existingMnemonic` sets up a restored phrase whose relays had no account
 * data (see the restore sync page): the account is already chosen, so it
 * skips the choice step.
 */
export type OnboardingAccountType =
  | "new"
  | "restore"
  | "transfer"
  | "existingMnemonic"
export type OnboardingPaymentMethod = "cash" | "btc"

const onboardingStepsByAccountType = {
  new: ["accountChoice", "payments"],
  restore: ["accountChoice", "restore"],
  transfer: ["accountChoice", "transfer"],
  existingMnemonic: ["payments"],
} satisfies Record<OnboardingAccountType, ReadonlyArray<OnboardingStep>>

export const getOnboardingSteps = (
  accountType: OnboardingAccountType | null
): ReadonlyArray<OnboardingStep> =>
  onboardingStepsByAccountType[accountType ?? "new"]

interface OnboardingFormState {
  readonly step: OnboardingStep
  readonly accountType: OnboardingAccountType | null
  readonly paymentMethods: ReadonlySet<OnboardingPaymentMethod>
  readonly businessName: string
  readonly iban: string
}

export const initialOnboardingFormState: OnboardingFormState = {
  step: "accountChoice",
  accountType: null,
  paymentMethods: new Set(["cash", "btc"]),
  businessName: "",
  iban: "",
}

export const onboardingFormAtom = atom<OnboardingFormState>(
  initialOnboardingFormState
)
