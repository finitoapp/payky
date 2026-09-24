import { useNavigate } from "@tanstack/react-router"
import { useAtom, useAtomValue } from "jotai"
import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { PhoneViewport } from "@/components/phone-viewport.tsx"
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
} from "@/components/reui/stepper.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardFooter } from "@/components/ui/card.tsx"
import {
  accountListQuery,
  removeDeviceAccount,
  selectAccount,
} from "@/core/evolu/device-account.ts"
import { getDeviceLocaleForLanguage } from "@/core/evolu/device-client.ts"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import { completeOnboarding } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { setLegalEntity } from "@/core/modules/legal-entity/legal-entity-actions.ts"
import { legalEntityQuery } from "@/core/modules/legal-entity/legal-entity-queries.ts"
import { BankAccountInputIbanSchema } from "@/core/modules/shared/schema.ts"
import { seedTaxRatesForCountry } from "@/core/modules/tax-rate/tax-rate-actions.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import { useRestoreAccount } from "@/features/account/use-restore-account.ts"
import {
  getOnboardingSteps,
  initialOnboardingFormState,
  type OnboardingPaymentMethod,
  onboardingFormAtom,
} from "@/features/onboarding/onboarding-form-state.ts"
import { AccountChoiceStep } from "@/features/onboarding/onboarding-steps/account-choice-step.tsx"
import { AccountStep } from "@/features/onboarding/onboarding-steps/account-step.tsx"
import { CountryCurrencyStep } from "@/features/onboarding/onboarding-steps/country-currency-step.tsx"
import { PaymentsStep } from "@/features/onboarding/onboarding-steps/payments-step.tsx"
import { RestoreAccountStep } from "@/features/onboarding/onboarding-steps/restore-account-step.tsx"
import {
  getDefaultCountryForLanguage,
  getDefaultCurrencyForCountry,
  getDefaultPaymentMethodForOnboarding,
  getPaymentMethodOrder,
} from "@/features/onboarding/onboarding-utils.ts"
import { LanguageSelect } from "@/features/shared/language-select.tsx"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useSetLocale } from "@/hooks/use-locale.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function OnboardingPage() {
  const runToast = useRunToast()
  const navigate = useNavigate()
  const setLocale = useSetLocale()
  const { language, t } = useTranslation()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const [form, setForm] = useAtom(onboardingFormAtom)
  const [finishing, setFinishing] = useState(false)
  // Steps validate when the merchant tries to leave them, not while they
  // type or read: bank transfer starts enabled with an empty IBAN, and the
  // recovery phrase starts unconfirmed, so live validation would greet them
  // with errors they have not had a chance to answer yet. Reset on every
  // step change, so a step is never entered already complaining.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [cancelingSetup, setCancelingSetup] = useState(false)
  const {
    mnemonic,
    pending: restoring,
    error: restoreError,
    setMnemonic,
    restore,
  } = useRestoreAccount()
  const ibanInputId = useId()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const activeAccount = useAtomValue(accountAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const confirm = useConfirmDialog()
  const { data: deviceAccounts } = useDeviceEvoluQuery(accountListQuery)

  // Set when this account was created from Settings > App Account > Create
  // account (not this device's very first account): lets onboarding offer a
  // way back to it instead of being a one-way trap. `undefined` on a
  // genuinely first-run device, where there is nothing to fall back to.
  const fallbackAccount = deviceAccounts
    .filter((account) => account.id !== activeAccount.id)
    .sort((a, b) => b.lastUseAt - a.lastUseAt)[0]

  const {
    step,
    accountType,
    iban,
    country,
    vatPayer,
    paymentMethods: selectedPaymentMethods,
  } = form
  const onboardingSteps = getOnboardingSteps(accountType)
  const pending = finishing || restoring || cancelingSetup
  // Both defaults are provisional until the merchant answers: the country
  // follows the language they are reading in, and the currency follows the
  // country — so switching language on the country screen visibly moves both,
  // while an explicit pick of either stops following.
  const selectedCountry = country ?? getDefaultCountryForLanguage(language)
  const selectedCurrency =
    form.currency ?? getDefaultCurrencyForCountry(selectedCountry)

  const ibanEnabled = selectedPaymentMethods.has("iban")
  const ibanParseResult =
    ibanEnabled && iban !== ""
      ? BankAccountInputIbanSchema.safeParse(iban)
      : null
  const ibanMissing = ibanEnabled && iban === ""
  const ibanInvalid = ibanParseResult !== null && !ibanParseResult.success
  const getIbanError = (): TranslationKey | null => {
    if (!submitAttempted) return null
    if (ibanInvalid) return "settings.fiatBankAccount.iban.invalid"
    if (ibanMissing) return "settings.fiatBankAccount.iban.required"
    return null
  }
  const ibanError = getIbanError()
  const recoveryPhraseError: TranslationKey | null =
    submitAttempted && !form.recoveryPhraseConfirmed
      ? "onboarding.account.mnemonic.required"
      : null

  useEffect(() => {
    // The appSettings row's existence marks the account as onboarded. The row
    // can also appear mid-form when a restored account finishes its first
    // sync — leaving then keeps the synced settings intact.
    if (settings !== undefined) {
      void navigate({ to: "/", replace: true })
    }
  }, [navigate, settings])

  const stepIndex = onboardingSteps.indexOf(step)
  const canGoBack = stepIndex > 0 && !pending

  const goNext = () => {
    if (step === "payments") {
      setSubmitAttempted(true)
      if (ibanMissing || ibanInvalid) return
    }

    const nextStep = onboardingSteps[stepIndex + 1]
    if (nextStep) {
      setSubmitAttempted(false)
      setForm((current) => ({ ...current, step: nextStep }))
    }
  }

  const goBack = () => {
    const previousStep = onboardingSteps[stepIndex - 1]
    if (previousStep) {
      setSubmitAttempted(false)
      setForm((current) => ({ ...current, step: previousStep }))
    }
  }

  const togglePaymentMethod = (
    method: OnboardingPaymentMethod,
    checked: boolean
  ) => {
    setForm((current) => {
      const nextMethods = new Set(current.paymentMethods)
      if (checked) {
        nextMethods.add(method)
      } else {
        nextMethods.delete(method)
      }
      return { ...current, paymentMethods: nextMethods }
    })
  }

  const finishOnboarding = async () => {
    if (!form.recoveryPhraseConfirmed) {
      setSubmitAttempted(true)
      return
    }

    setFinishing(true)

    const succeeded = await runToast(async (run) => {
      // The header's language picker changes the wizard's own text as often as
      // the user likes; the device locale (number/money formatting) follows
      // from the language that survived to here, once, so switching back and
      // forth while reading never leaves the wrong regional format applied.
      setLocale(getDeviceLocaleForLanguage(language))

      // A restored account whose first sync hasn't finished yet can briefly
      // land back in onboarding (see the TODO in `_terminal.tsx`). Guard
      // these two against that race: unlike the singleton account upserts
      // below, `setLegalEntity` would overwrite an already-synced row via
      // last-write-wins, and `seedTaxRatesForCountry` has no upsert
      // semantics at all — it would insert a duplicate set of rates.
      const [existingLegalEntity, existingTaxRates] = await Promise.all([
        run.deps.evolu.loadQuery(legalEntityQuery),
        run.deps.evolu.loadQuery(taxRatesQuery),
      ])

      const persistedCountry =
        selectedCountry === "OTHER" ? null : selectedCountry
      if (existingLegalEntity.length === 0) {
        await run.ok(setLegalEntity({ country: persistedCountry, vatPayer }))
      }
      if (existingTaxRates.length === 0) {
        await run.ok(seedTaxRatesForCountry(persistedCountry))
      }
      await run.ok(
        saveCashRegisterAccount({
          enabled: selectedPaymentMethods.has("cash"),
          currency: selectedCurrency,
        })
      )
      await run.ok(
        saveSparkAccount({
          enabled: selectedPaymentMethods.has("btc"),
        })
      )
      await run.ok(
        saveFiatBankAccount({
          enabled: ibanEnabled,
          iban: ibanParseResult?.success ? ibanParseResult.data : undefined,
          currency: selectedCurrency,
        })
      )
      await run.ok(
        completeOnboarding({
          fiatCurrency: selectedCurrency,
          defaultPaymentMethod: getDefaultPaymentMethodForOnboarding(
            selectedPaymentMethods
          ),
          paymentMethodOrderJson: JSON.stringify(
            getPaymentMethodOrder(selectedPaymentMethods)
          ),
        })
      )
    })

    setFinishing(false)
    if (!succeeded) return

    setForm(initialOnboardingFormState)
    await navigate({ to: "/", replace: true })
  }

  const restoreExistingAccount = async () => {
    const restored = await restore()

    if (!restored) {
      return
    }

    setForm(initialOnboardingFormState)
    await navigate({ to: "/restore-account" })
  }

  const cancelSetup = async () => {
    if (fallbackAccount === undefined) return

    setCancelingSetup(true)
    try {
      const confirmed = await confirm({
        title: t("onboarding.cancelSetup.confirm.title"),
        description: t("onboarding.cancelSetup.confirm.description", {
          name: fallbackAccount.name,
        }),
        confirmLabel: t("onboarding.cancelSetup.confirm.confirm"),
        cancelLabel: t("onboarding.cancelSetup.confirm.cancel"),
      })
      if (!confirmed) return

      // The account being onboarded here has no data of its own yet, so
      // discarding it loses nothing — unlike `finishOnboarding`'s
      // `navigate`, no explicit redirect is needed: reloading the app Evolu
      // client re-derives `settings` for the now-active fallback account,
      // and the effect above navigates away from /onboarding once it sees
      // that account is already onboarded.
      removeDeviceAccount(deviceEvolu, activeAccount.id)
      selectAccount(deviceEvolu, fallbackAccount.id)
      setForm(initialOnboardingFormState)
      reloadAppEvolu()
    } finally {
      setCancelingSetup(false)
    }
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <PhoneViewport className="justify-center px-5 py-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-muted-foreground">
                {t("onboarding.progress")} {stepIndex + 1}/
                {onboardingSteps.length}
              </p>
              <h1 className="font-semibold text-2xl leading-tight">
                {t("onboarding.title")}
              </h1>
            </div>
            <Stepper
              value={stepIndex + 1}
              orientation="horizontal"
              aria-hidden="true"
              className="w-auto"
            >
              <StepperNav>
                {onboardingSteps.map((onboardingStep, index) => (
                  <StepperItem key={onboardingStep} step={index + 1}>
                    <StepperIndicator className="size-2 bg-muted-foreground/30 data-[state=active]:bg-primary data-[state=completed]:bg-primary" />
                    {index < onboardingSteps.length - 1 ? (
                      <StepperSeparator className="w-4" />
                    ) : null}
                  </StepperItem>
                ))}
              </StepperNav>
            </Stepper>
          </div>

          {fallbackAccount ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2.5 self-start text-muted-foreground"
              disabled={pending}
              onClick={() => void cancelSetup()}
            >
              {t("onboarding.cancelSetup")}
            </Button>
          ) : null}

          <Card>
            {step === "accountChoice" ? (
              <AccountChoiceStep
                pending={pending}
                onSelect={(nextAccountType) => {
                  // The choice is the only thing on this step, so it advances
                  // on its own instead of carrying a Next button — and where
                  // it advances to depends on the choice itself, which is why
                  // the steps are re-derived here rather than read from
                  // `onboardingSteps` (still built from the previous answer).
                  const nextSteps = getOnboardingSteps(nextAccountType)
                  setForm((current) => ({
                    ...current,
                    accountType: nextAccountType,
                    step: nextSteps[1] ?? current.step,
                  }))
                }}
              />
            ) : null}

            {step === "countryCurrency" ? (
              <CountryCurrencyStep
                country={selectedCountry}
                currency={selectedCurrency}
                vatPayer={vatPayer}
                pending={pending}
                onSelectCountry={(nextCountry) => {
                  setForm((current) => ({ ...current, country: nextCountry }))
                }}
                onSelectCurrency={(nextCurrency) => {
                  setForm((current) => ({ ...current, currency: nextCurrency }))
                }}
                onChangeVatPayer={(nextVatPayer) => {
                  setForm((current) => ({
                    ...current,
                    vatPayer: nextVatPayer,
                  }))
                }}
              />
            ) : null}

            {step === "payments" ? (
              <PaymentsStep
                iban={iban}
                ibanError={ibanError}
                ibanInputId={ibanInputId}
                paymentMethods={selectedPaymentMethods}
                pending={pending}
                onIbanChange={(nextIban) => {
                  setForm((current) => ({ ...current, iban: nextIban }))
                }}
                onTogglePaymentMethod={togglePaymentMethod}
              />
            ) : null}

            {step === "account" ? (
              <AccountStep
                recoveryPhraseConfirmed={form.recoveryPhraseConfirmed}
                recoveryPhraseError={recoveryPhraseError}
                onRecoveryPhraseConfirmedChange={(confirmed) => {
                  setForm((current) => ({
                    ...current,
                    recoveryPhraseConfirmed: confirmed,
                  }))
                }}
              />
            ) : null}

            {step === "restore" ? (
              <RestoreAccountStep
                error={restoreError}
                mnemonic={mnemonic}
                pending={pending}
                onBack={goBack}
                onMnemonicChange={setMnemonic}
                onRestore={() => {
                  void restoreExistingAccount()
                }}
              />
            ) : null}

            {/* The account choice advances on click, so it carries no footer
                at all — and being the first step, it has nowhere to go back
                to either. */}
            {step === "restore" || step === "accountChoice" ? null : (
              <CardFooter className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canGoBack}
                  onClick={goBack}
                >
                  <ChevronLeft data-icon="inline-start" />
                  {t("onboarding.back")}
                </Button>
                {step === "account" ? (
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={finishOnboarding}
                  >
                    <Check data-icon="inline-start" />
                    {t("onboarding.finish")}
                  </Button>
                ) : (
                  <Button type="button" disabled={pending} onClick={goNext}>
                    {t("onboarding.next")}
                    <ChevronRight data-icon="inline-end" />
                  </Button>
                )}
              </CardFooter>
            )}
          </Card>

          <div className="flex justify-end">
            <LanguageSelect disabled={pending} />
          </div>
        </div>
      </PhoneViewport>
    </main>
  )
}
