import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  getOnboardingSteps,
  type OnboardingStep,
  onboardingFormAtom,
} from "@payky/app-shared/onboarding-form-state"
import { validateOnboardingForm } from "@payky/app-shared/onboarding-utils"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { router } from "expo-router"
import { useAtom } from "jotai"
import { useEffect, useState } from "react"
import { BackHandler } from "react-native"
import { Text, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { Screen } from "../../components/screen.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { AccountChoiceStep } from "./account-choice-step.tsx"
import { LanguageSelect } from "./language-select.tsx"
import { PaymentsStep } from "./payments-step.tsx"

// Only the steps native implements; restore and transfer come later.
const headingKeys = {
  accountChoice: "onboarding.title",
  payments: "onboarding.payments.title",
  restore: "onboarding.restore.title",
  transfer: "accountTransfer.target.title",
} satisfies Record<OnboardingStep, TranslationKey>
const descriptionKeys = {
  accountChoice: "onboarding.accountChoice.description",
  payments: "onboarding.payments.description",
  restore: "onboarding.restore.description",
  transfer: "accountTransfer.target.description",
} satisfies Record<OnboardingStep, TranslationKey>

export function OnboardingPage() {
  const { t } = useTranslation()
  const [settings] = useEvoluQuery(settingsQuery).data
  const [form, setForm] = useAtom(onboardingFormAtom)
  const { step, accountType, iban, businessName } = form
  // Validate only on submission, so an unfinished account number shows no
  // error while it is still being typed (as on web).
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const validation = validateOnboardingForm({ iban, businessName })
  const ibanError: TranslationKey | null =
    submitAttempted && validation.ibanInvalid
      ? "settings.fiatBankAccount.iban.invalid"
      : null
  const steps = getOnboardingSteps(accountType)
  const stepIndex = steps.indexOf(step)

  // The appSettings row marks the account as onboarded (same as web): leave
  // so a finished or synced account never finishes again.
  useEffect(() => {
    if (settings !== undefined) router.replace("/")
  }, [settings])

  const goBack = () => {
    const previous = steps[stepIndex - 1]
    if (previous === undefined) return false
    setSubmitAttempted(false)
    setForm((current) => ({ ...current, step: previous }))
    return true
  }

  // Android's back button walks the steps before it leaves the screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: goBack closes over the current step
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      goBack
    )
    return () => subscription.remove()
  }, [step, accountType])

  return (
    <Screen>
      <LanguageSelect />
      <YStack gap="2">
        <Text fontSize={24} fontWeight="700" accessibilityRole="header">
          {t(headingKeys[step])}
        </Text>
        <Text color="muted-foreground">{t(descriptionKeys[step])}</Text>
      </YStack>

      {step === "accountChoice" ? (
        <AccountChoiceStep
          pending={false}
          onSelect={(nextAccountType) => {
            const nextSteps = getOnboardingSteps(nextAccountType)
            setForm((current) => ({
              ...current,
              accountType: nextAccountType,
              step: nextSteps[1] ?? current.step,
            }))
          }}
        />
      ) : null}

      {step === "payments" ? (
        <>
          <PaymentsStep
            iban={iban}
            ibanError={ibanError}
            pending={false}
            onIbanChange={(nextIban) => {
              setForm((current) => ({ ...current, iban: nextIban }))
            }}
          />
          <AppButton
            label={t(
              iban.trim() === ""
                ? "onboarding.finishWithoutBankTransfer"
                : "onboarding.finish"
            )}
            onPress={() => {
              if (validation.ibanInvalid) setSubmitAttempted(true)
            }}
          />
        </>
      ) : null}

      {stepIndex > 0 ? (
        <AppButton
          label={t("onboarding.back")}
          variant="secondary"
          onPress={() => {
            goBack()
          }}
        />
      ) : null}
    </Screen>
  )
}
