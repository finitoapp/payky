import { useNavigate } from "@tanstack/react-router"
import { useAtom, useAtomValue } from "jotai"
import { Check, ChevronLeft } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { PhoneViewport } from "@/components/phone-viewport.tsx"
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
  saveCashuAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import { defaultCashuMintUrl } from "@/core/modules/account/account-utils.ts"
import { completeOnboarding } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { setLegalEntity } from "@/core/modules/legal-entity/legal-entity-actions.ts"
import { legalEntityQuery } from "@/core/modules/legal-entity/legal-entity-queries.ts"
import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import { getBankNameForIban } from "@/core/modules/shared/bank-codes.ts"
import {
  BankAccountInputIbanSchema,
  FiatCurrency,
} from "@/core/modules/shared/schema.ts"
import { seedTaxRatesForCountry } from "@/core/modules/tax-rate/tax-rate-actions.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import { useRestoreAccount } from "@/features/account/use-restore-account.ts"
import {
  getOnboardingSteps,
  initialOnboardingFormState,
  initialOnboardingStep,
  onboardingFormAtom,
} from "@/features/onboarding/onboarding-form-state.ts"
import { PaymentsStep } from "@/features/onboarding/onboarding-steps/payments-step.tsx"
import { RestoreAccountStep } from "@/features/onboarding/onboarding-steps/restore-account-step.tsx"
import { StartStep } from "@/features/onboarding/onboarding-steps/start-step.tsx"
import {
  getDefaultPaymentMethodForOnboarding,
  getPaymentMethodOrder,
} from "@/features/onboarding/onboarding-utils.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useSetLocale } from "@/hooks/use-locale.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * Onboarding no longer asks: the language follows the device, the legal
 * entity starts Czech (non-VAT) and the currency CZK. Settings has every one
 * of them for merchants elsewhere.
 */
const onboardingCountry: CountryCode = "CZ"
const onboardingCurrency = FiatCurrency.CZK

export function OnboardingPage({
  restoredAccountSetup,
}: {
  readonly restoredAccountSetup: boolean
}) {
  const appRun = useAppRun()
  const navigate = useNavigate()
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

  const { step, accountType, iban, paymentMethods } = form
  const onboardingSteps = getOnboardingSteps({
    accountType,
    restoredAccountSetup,
  })
  const pending = finishing || restoring || cancelingSetup

  // An empty account is a skip, not an error: bank transfers stay off until
  // the account is added in Settings.
  const ibanParseResult =
    iban.trim() === "" ? null : BankAccountInputIbanSchema.safeParse(iban)
  const ibanEnabled = ibanParseResult?.success === true
  const ibanInvalid = ibanParseResult !== null && !ibanParseResult.success
  const ibanError: TranslationKey | null = ibanInvalid
    ? "settings.fiatBankAccount.iban.invalid"
    : null
  const detectedBank = ibanParseResult?.success
    ? getBankNameForIban(ibanParseResult.data)
    : null
  const enabledPaymentMethods = ibanEnabled
    ? paymentMethods
    : new Set([...paymentMethods].filter((method) => method !== "iban"))

  useEffect(() => {
    // The appSettings row's existence marks the account as onboarded. The row
    // can also appear mid-form when a restored account finishes its first
    // sync — leaving then keeps the synced settings intact.
    if (settings !== undefined) {
      void navigate({ to: "/", replace: true })
    }
  }, [navigate, settings])

  // The form atom starts every wizard at "start"; the restored-account flow
  // has no such step, so land on its own first one instead.
  useEffect(() => {
    if (onboardingSteps.includes(step)) return
    setForm((current) => ({
      ...current,
      step: initialOnboardingStep(restoredAccountSetup),
    }))
  }, [onboardingSteps, restoredAccountSetup, setForm, step])

  const stepIndex = onboardingSteps.indexOf(step)
  const canGoBack = stepIndex > 0 && !pending

  const goBack = () => {
    const previousStep = onboardingSteps[stepIndex - 1]
    if (previousStep) {
      setForm((current) => ({ ...current, step: previousStep }))
    }
  }

  const finishOnboarding = async () => {
    setFinishing(true)
    try {
      setLocale(getDeviceLocaleForLanguage(language))

      await using run = appRun()

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

      if (existingLegalEntity.length === 0) {
        await run(
          setLegalEntity({ country: onboardingCountry, vatPayer: null })
        )
      }
      if (existingTaxRates.length === 0) {
        await run(seedTaxRatesForCountry(onboardingCountry))
      }
      await run(
        saveCashRegisterAccount({
          enabled: enabledPaymentMethods.has("cash"),
          currency: onboardingCurrency,
        })
      )
      await run(
        saveSparkAccount({
          enabled: enabledPaymentMethods.has("btc"),
        })
      )
      await run(
        saveCashuAccount({
          enabled: enabledPaymentMethods.has("cashu"),
          mintUrl: defaultCashuMintUrl,
        })
      )
      await run(
        saveFiatBankAccount({
          enabled: ibanEnabled,
          iban: ibanParseResult?.success ? ibanParseResult.data : undefined,
          currency: onboardingCurrency,
        })
      )
      await run(
        completeOnboarding({
          fiatCurrency: onboardingCurrency,
          defaultPaymentMethod: getDefaultPaymentMethodForOnboarding(
            enabledPaymentMethods
          ),
          paymentMethodOrderJson: JSON.stringify(
            getPaymentMethodOrder(enabledPaymentMethods)
          ),
        })
      )

      setForm(initialOnboardingFormState)
      await navigate({ to: "/", replace: true })
    } finally {
      setFinishing(false)
    }
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

          {step === "start" ? (
            <StartStep
              pending={pending}
              onSelect={(nextAccountType) => {
                setForm((current) => ({
                  ...current,
                  accountType: nextAccountType,
                  step: nextAccountType === "restore" ? "restore" : "payments",
                }))
              }}
            />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img
                  src="/pwa-icon.svg"
                  alt=""
                  className="size-10 rounded-xl"
                />
                <h1 className="font-semibold text-2xl leading-tight">
                  {t("onboarding.title")}
                </h1>
              </div>

              <Card>
                {step === "payments" ? (
                  <>
                    <PaymentsStep
                      iban={iban}
                      ibanError={ibanError}
                      ibanInputId={ibanInputId}
                      detectedBank={detectedBank}
                      pending={pending}
                      onIbanChange={(nextIban) => {
                        setForm((current) => ({ ...current, iban: nextIban }))
                      }}
                    />
                    <CardFooter className="flex items-center justify-between gap-3">
                      {canGoBack ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={pending}
                          onClick={goBack}
                        >
                          <ChevronLeft data-icon="inline-start" />
                          {t("onboarding.back")}
                        </Button>
                      ) : (
                        <span />
                      )}
                      <Button
                        type="button"
                        disabled={pending || ibanInvalid}
                        onClick={finishOnboarding}
                      >
                        <Check data-icon="inline-start" />
                        {t("onboarding.finish")}
                      </Button>
                    </CardFooter>
                  </>
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
              </Card>
            </>
          )}
        </div>
      </PhoneViewport>
    </main>
  )
}
