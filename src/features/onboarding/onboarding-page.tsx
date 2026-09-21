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
import { CountryStep } from "@/features/onboarding/onboarding-steps/country-step.tsx"
import { CurrencyStep } from "@/features/onboarding/onboarding-steps/currency-step.tsx"
import { LanguageStep } from "@/features/onboarding/onboarding-steps/language-step.tsx"
import { PaymentsStep } from "@/features/onboarding/onboarding-steps/payments-step.tsx"
import { RestoreAccountStep } from "@/features/onboarding/onboarding-steps/restore-account-step.tsx"
import {
  getDefaultCurrencyForCountry,
  getDefaultPaymentMethodForOnboarding,
  getPaymentMethodOrder,
} from "@/features/onboarding/onboarding-utils.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useSetLocale } from "@/hooks/use-locale.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useSetLanguage, useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function OnboardingPage() {
  const runToast = useRunToast()
  const navigate = useNavigate()
  const setLanguage = useSetLanguage()
  const setLocale = useSetLocale()
  const { language, t } = useTranslation()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const [form, setForm] = useAtom(onboardingFormAtom)
  const [finishing, setFinishing] = useState(false)
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
  const selectedCurrency =
    form.currency ?? getDefaultCurrencyForCountry(country)

  const ibanEnabled = selectedPaymentMethods.has("iban")
  const ibanParseResult =
    ibanEnabled && iban !== ""
      ? BankAccountInputIbanSchema.safeParse(iban)
      : null
  const ibanMissing = ibanEnabled && iban === ""
  const ibanInvalid = ibanParseResult !== null && !ibanParseResult.success
  const ibanError: TranslationKey | null = ibanInvalid
    ? "settings.fiatBankAccount.iban.invalid"
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
    const nextStep = onboardingSteps[stepIndex + 1]
    if (nextStep) {
      setForm((current) => ({ ...current, step: nextStep }))
    }
  }

  const goBack = () => {
    const previousStep = onboardingSteps[stepIndex - 1]
    if (previousStep) {
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
    setFinishing(true)

    const succeeded = await runToast(async (run) => {
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

      const persistedCountry = country === "OTHER" ? null : country
      if (existingLegalEntity.length === 0) {
        await run.ok(setLegalEntity({ country: persistedCountry, vatPayer }))
      }
      if (existingTaxRates.length === 0) {
        await run.ok(seedTaxRatesForCountry(persistedCountry))
      }
      // `saveCashRegisterAccount`/`saveSparkAccount`/`saveFiatBankAccount` can
      // return `DefaultPaymentMethodCannotBeDisabledError` (a restored account
      // landing back in onboarding, see the race note above, can already have
      // one of these set as the default). `run.orThrow` turns that into
      // `runToast`'s fallback toast instead of silently leaving the account
      // half-updated.
      await run.orThrow(
        saveCashRegisterAccount({
          enabled: selectedPaymentMethods.has("cash"),
          currency: selectedCurrency,
        })
      )
      await run.orThrow(
        saveSparkAccount({
          enabled: selectedPaymentMethods.has("btc"),
        })
      )
      await run.orThrow(
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
            {step === "language" ? (
              <LanguageStep
                language={language}
                pending={pending}
                onSelect={(nextLanguage) => {
                  // Only previews the wizard's own text live. The device
                  // locale (number/money formatting) is derived from the
                  // final language choice once, in finishOnboarding — not
                  // on every intermediate click here — so switching languages
                  // back and forth while deciding never leaves the wrong
                  // regional format applied.
                  setLanguage(nextLanguage)
                }}
              />
            ) : null}

            {step === "accountChoice" ? (
              <AccountChoiceStep
                accountType={accountType}
                pending={pending}
                onSelect={(nextAccountType) => {
                  setForm((current) => ({
                    ...current,
                    accountType: nextAccountType,
                  }))
                }}
              />
            ) : null}

            {step === "country" ? (
              <CountryStep
                country={country}
                vatPayer={vatPayer}
                pending={pending}
                onSelectCountry={(nextCountry) => {
                  setForm((current) => ({ ...current, country: nextCountry }))
                }}
                onChangeVatPayer={(nextVatPayer) => {
                  setForm((current) => ({
                    ...current,
                    vatPayer: nextVatPayer,
                  }))
                }}
              />
            ) : null}

            {step === "currency" ? (
              <CurrencyStep
                currency={selectedCurrency}
                pending={pending}
                onSelect={(nextCurrency) => {
                  setForm((current) => ({ ...current, currency: nextCurrency }))
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
            ) : (
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
                    disabled={pending || !form.recoveryPhraseConfirmed}
                    onClick={finishOnboarding}
                  >
                    <Check data-icon="inline-start" />
                    {t("onboarding.finish")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={
                      pending ||
                      (step === "accountChoice" && accountType === null) ||
                      (step === "country" && country === null) ||
                      (step === "payments" && (ibanMissing || ibanInvalid))
                    }
                    onClick={goNext}
                  >
                    {t("onboarding.next")}
                    <ChevronRight data-icon="inline-end" />
                  </Button>
                )}
              </CardFooter>
            )}
          </Card>
        </div>
      </PhoneViewport>
    </main>
  )
}
