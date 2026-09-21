import { atom } from "jotai"

/**
 * `start` chooses between a new and a restored account; `payments` asks the
 * one question a terminal needs (the bank account); `restore` takes the 20
 * words. Language follows the device, country and currency are Czech
 * defaults changed later in Settings.
 */
export type OnboardingStep = "start" | "payments" | "restore"
export type OnboardingAccountType = "new" | "restore"
export type OnboardingPaymentMethod = "cash" | "btc" | "cashu" | "iban"

const newAccountOnboardingSteps: ReadonlyArray<OnboardingStep> = [
  "start",
  "payments",
]

const restoreAccountOnboardingSteps: ReadonlyArray<OnboardingStep> = [
  "start",
  "restore",
]

/**
 * Setting up an account whose phrase was restored but never used in Payky:
 * the account exists and its recovery phrase is the one the user typed, so
 * only the terminal's own question remains.
 */
const restoredAccountSetupSteps: ReadonlyArray<OnboardingStep> = ["payments"]

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
): OnboardingStep => (restoredAccountSetup ? "payments" : "start")

interface OnboardingFormState {
  readonly step: OnboardingStep
  readonly accountType: OnboardingAccountType | null
  readonly paymentMethods: ReadonlySet<OnboardingPaymentMethod>
  readonly iban: string
}

export const initialOnboardingFormState: OnboardingFormState = {
  step: "start",
  accountType: null,
  // Bank transfer (once an account is entered) and bitcoin over cashu; cash
  // and Spark are opt-in in Settings.
  paymentMethods: new Set(["iban", "cashu"]),
  iban: "",
}

export const onboardingFormAtom = atom<OnboardingFormState>(
  initialOnboardingFormState
)
