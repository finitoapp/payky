import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  getOnboardingSteps,
  initialOnboardingFormState,
  type OnboardingStep,
  onboardingFormAtom,
} from "@payky/app-shared/onboarding-form-state"
import {
  createFinishOnboardingInput,
  validateOnboardingForm,
} from "@payky/app-shared/onboarding-utils"
import { checkRestorePhrase } from "@payky/app-shared/restore-phrase"
import { restoredAccountAtom } from "@payky/app-shared/restored-account"
import { createOrSelectAccount } from "@payky/core/evolu/device-account"
import { getDeviceLocaleForLanguage } from "@payky/core/evolu/device-client"
import { publishNostrProfileName } from "@payky/core/integrations/nostr/nostr-client"
import {
  finishOnboarding,
  requireNotOnboarded,
} from "@payky/core/modules/app-settings/app-settings-actions"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { mnemonicToMasterKey } from "@payky/core/modules/shared/key-derivation"
import { router } from "expo-router"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef, useState } from "react"
import { BackHandler } from "react-native"
import { Text, YStack } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { deviceEvoluAtom } from "../../atoms/device-evolu.ts"
import { reloadAppEvoluAtom } from "../../atoms/evolu-counter.ts"
import { AppButton } from "../../components/app-button.tsx"
import { Screen } from "../../components/screen.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../hooks/use-run-toast.ts"
import { useSetLocale, useTranslation } from "../../hooks/use-translation.ts"
import { AccountChoiceStep } from "./account-choice-step.tsx"
import { LanguageSelect } from "./language-select.tsx"
import { PaymentsStep } from "./payments-step.tsx"
import { RestoreAccountStep } from "./restore-account-step.tsx"

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
  const { language, t } = useTranslation()
  const runToast = useRunToast()
  const setLocale = useSetLocale()
  const [settings] = useEvoluQuery(settingsQuery).data
  const [form, setForm] = useAtom(onboardingFormAtom)
  const { step, accountType, iban, businessName } = form
  // Validate only on submission, so an unfinished account number shows no
  // error while it is still being typed (as on web).
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [finishing, setFinishing] = useState(false)
  // A second tap before the first finishes must not start another run;
  // `finishOnboarding` refuses an onboarded account too, this saves the wait.
  const finishingRef = useRef(false)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const activeAccount = useAtomValue(accountAtom)
  const reloadAppEvolu = useSetAtom(reloadAppEvoluAtom)
  const setRestoredAccount = useSetAtom(restoredAccountAtom)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<TranslationKey | null>(null)
  const [profilePublishFailed, setProfilePublishFailed] = useState(false)
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

  const finish = async (skipProfile = false) => {
    if (finishingRef.current) return
    // Validation precedes publishing the name (onboarding/0004, 0006).
    if (validation.ibanInvalid || validation.businessNameInvalid) {
      setSubmitAttempted(true)
      return
    }
    finishingRef.current = true
    setFinishing(true)
    await runToast(async (run) => {
      const allowed = await run(requireNotOnboarded())
      if (!allowed.ok) return "onboarding.alreadyOnboarded"

      if (!skipProfile && validation.businessName !== null) {
        const published = await run(
          publishNostrProfileName({ name: validation.businessName })
        )
        if (!published.ok) {
          setProfilePublishFailed(true)
          return
        }
      }
      setProfilePublishFailed(false)
      // The language may have been switched while reading; the formatting
      // locale follows the one that survived, once (as web does).
      setLocale(getDeviceLocaleForLanguage(language))

      const finished = await run(
        finishOnboarding(createFinishOnboardingInput(validation.iban))
      )
      if (!finished.ok) return "onboarding.alreadyOnboarded"
      setForm(initialOnboardingFormState)
      router.replace("/")
    })
    finishingRef.current = false
    setFinishing(false)
  }

  // Selects (or adds) the phrase's account, then waits for its first sync on
  // /restore-account (as web). The phrase is never stored or logged.
  const restore = async (phrase: string) => {
    if (restoring) return
    setRestoreError(null)
    const checked = checkRestorePhrase(phrase)
    if (!checked.ok) {
      setRestoreError(checked.error)
      return
    }
    setRestoring(true)
    try {
      const masterKey = await mnemonicToMasterKey(checked.mnemonic)
      const { created } = await createOrSelectAccount(deviceEvolu, masterKey)
      reloadAppEvolu()
      setRestoredAccount({ created, previous: activeAccount.id })
    } catch {
      setRestoreError("settings.accounts.restore.failed")
      setRestoring(false)
      return
    }
    setForm(initialOnboardingFormState)
    router.replace({
      pathname: "/restore-account",
      params: { source: "onboarding" },
    })
  }

  const goBack = () => {
    const previous = steps[stepIndex - 1]
    if (previous === undefined) return false
    if (finishingRef.current) return true
    setSubmitAttempted(false)
    setRestoreError(null)
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

      {step === "restore" ? (
        <RestoreAccountStep
          error={restoreError}
          pending={restoring}
          onRestore={(phrase) => {
            void restore(phrase)
          }}
        />
      ) : null}

      {step === "payments" ? (
        <>
          <PaymentsStep
            businessName={businessName}
            businessNameError={
              submitAttempted && validation.businessNameInvalid
                ? "settings.profile.name.invalid"
                : null
            }
            iban={iban}
            ibanError={ibanError}
            pending={finishing}
            onBusinessNameChange={(nextName) => {
              setProfilePublishFailed(false)
              setForm((current) => ({ ...current, businessName: nextName }))
            }}
            onIbanChange={(nextIban) => {
              setForm((current) => ({ ...current, iban: nextIban }))
            }}
          />
          {profilePublishFailed ? (
            <YStack gap="1" accessibilityRole="alert">
              <Text color="red-600" fontWeight="600">
                {t("onboarding.businessName.publishFailed.title")}
              </Text>
              <Text color="red-600">
                {t("onboarding.businessName.publishFailed.description")}
              </Text>
            </YStack>
          ) : null}
          <AppButton
            label={t(
              profilePublishFailed
                ? "onboarding.businessName.retry"
                : iban.trim() === ""
                  ? "onboarding.finishWithoutBankTransfer"
                  : "onboarding.finish"
            )}
            pending={finishing}
            onPress={() => {
              void finish()
            }}
          />
          {profilePublishFailed ? (
            <AppButton
              label={t("onboarding.businessName.continueWithoutPublishing")}
              variant="secondary"
              disabled={finishing}
              onPress={() => {
                void finish(true)
              }}
            />
          ) : null}
        </>
      ) : null}

      {stepIndex > 0 ? (
        <AppButton
          label={t("onboarding.back")}
          variant="secondary"
          disabled={finishing || restoring}
          onPress={() => {
            goBack()
          }}
        />
      ) : null}
    </Screen>
  )
}
