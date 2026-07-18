import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  BadgeDollarSign,
  Banknote,
  Bitcoin,
  Check,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Languages,
} from "lucide-react"
import { useEffect, useId, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { evoluCounterAtom } from "@/atoms/evolu-counter.ts"
import { PhoneViewport } from "@/components/phone-viewport.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { updateAccountName } from "@/core/evolu/device-account.ts"
import { getDeviceLocaleForLanguage } from "@/core/evolu/device-client.ts"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import { completeOnboarding } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import {
  BankAccountInputIbanSchema,
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import {
  initialOnboardingFormState,
  type OnboardingPaymentMethod,
  type OnboardingStep,
  onboardingFormAtom,
  onboardingSteps,
} from "@/features/onboarding/onboarding-form-state.ts"
import { languageOptions } from "@/features/settings/language-options.ts"
import { OptionToggleGroup } from "@/features/settings/option-toggle-group.tsx"
import { RecoveryPhraseCard } from "@/features/settings/security/recovery-phrase-card.tsx"
import { TransportToggleList } from "@/features/settings/security/transport-toggle-list.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useSetLocale } from "@/hooks/use-locale.ts"
import {
  useTranslation,
  useTranslationForLanguage,
} from "@/hooks/use-translation.ts"
import type { Language, TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
})

interface PaymentMethodOption {
  readonly value: OnboardingPaymentMethod
  readonly label: TranslationKey
  readonly description: TranslationKey
  readonly icon: typeof Banknote
}

interface CurrencyOption {
  readonly value: FiatCurrencyType
  readonly label: TranslationKey
  readonly description: TranslationKey
}

const paymentMethodOptions: ReadonlyArray<PaymentMethodOption> = [
  {
    value: "cash",
    label: "onboarding.payments.cash.title",
    description: "onboarding.payments.cash.description",
    icon: Banknote,
  },
  {
    value: "btc",
    label: "onboarding.payments.btc.title",
    description: "onboarding.payments.btc.description",
    icon: Bitcoin,
  },
  {
    value: "iban",
    label: "onboarding.payments.iban.title",
    description: "onboarding.payments.iban.description",
    icon: Landmark,
  },
]

const currencyOptions: ReadonlyArray<CurrencyOption> = [
  {
    value: FiatCurrency.USD,
    label: "settings.fiat.usd.title",
    description: "settings.fiat.usd.description",
  },
  {
    value: FiatCurrency.EUR,
    label: "settings.fiat.eur.title",
    description: "settings.fiat.eur.description",
  },
  {
    value: FiatCurrency.CZK,
    label: "settings.fiat.czk.title",
    description: "settings.fiat.czk.description",
  },
]

const getStepIndex = (step: OnboardingStep) => onboardingSteps.indexOf(step)

const getDefaultCurrencyForLanguage = (
  languageValue: Language
): FiatCurrencyType => {
  if (languageValue === "cs") {
    return FiatCurrency.CZK
  }

  if (languageValue === "sk") {
    return FiatCurrency.EUR
  }

  return FiatCurrency.USD
}

function OnboardingPage() {
  const appRun = useAppRun()
  const navigate = useNavigate()
  const setLanguage = useTranslationForLanguage()
  const setLocale = useSetLocale()
  const { language, t } = useTranslation()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const [form, setForm] = useAtom(onboardingFormAtom)
  const [ibanError, setIbanError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)
  const ibanInputId = useId()

  const { step, iban, paymentMethods: selectedPaymentMethods } = form
  const selectedCurrency =
    form.currency ?? getDefaultCurrencyForLanguage(language)

  useEffect(() => {
    // The appSettings row's existence marks the account as onboarded. The row
    // can also appear mid-form when a restored account finishes its first
    // sync — leaving then keeps the synced settings intact.
    if (settings !== undefined) {
      void navigate({ to: "/", replace: true })
    }
  }, [navigate, settings])

  const stepIndex = getStepIndex(step)
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
    setIbanError(null)
  }

  const finishOnboarding = async () => {
    setIbanError(null)

    const ibanEnabled = selectedPaymentMethods.has("iban")
    const ibanResult =
      iban === "" ? null : BankAccountInputIbanSchema.safeParse(iban)

    if (ibanEnabled && !ibanResult) {
      setIbanError("settings.fiatBankAccount.iban.required")
      return
    }

    if (ibanResult?.success === false) {
      setIbanError("settings.fiatBankAccount.iban.invalid")
      return
    }

    setPending(true)
    try {
      setLocale(getDeviceLocaleForLanguage(language))

      await using run = appRun()

      await run(
        saveCashRegisterAccount({
          enabled: selectedPaymentMethods.has("cash"),
          currency: selectedCurrency,
        })
      )
      await run(
        saveSparkAccount({
          enabled: selectedPaymentMethods.has("btc"),
        })
      )
      await run(
        saveFiatBankAccount({
          enabled: ibanEnabled,
          iban: ibanResult?.data,
          currency: selectedCurrency,
        })
      )
      await run(
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

      setForm(initialOnboardingFormState)
      await navigate({ to: "/", replace: true })
    } finally {
      setPending(false)
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
            <StepDots activeStep={step} />
          </div>

          <Card>
            {step === "language" ? (
              <LanguageStep
                language={language}
                pending={pending}
                onSelect={(nextLanguage) => {
                  const nextLocale = getDeviceLocaleForLanguage(nextLanguage)
                  setLanguage(nextLanguage)
                  setLocale(nextLocale)
                  setForm((current) => ({
                    ...current,
                    currency: getDefaultCurrencyForLanguage(nextLanguage),
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
                  setIbanError(null)
                }}
                onTogglePaymentMethod={togglePaymentMethod}
              />
            ) : null}

            {step === "account" ? <AccountStep /> : null}

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
          </Card>
        </div>
      </PhoneViewport>
    </main>
  )
}

function LanguageStep({
  language,
  pending,
  onSelect,
}: {
  readonly language: Language
  readonly pending: boolean
  readonly onSelect: (language: Language) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.language.title")}</CardTitle>
        <CardDescription>
          {t("onboarding.language.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OptionToggleGroup
          value={language}
          options={languageOptions.map((option) => ({
            value: option.value,
            icon: Languages,
            title: option.label,
            description: t(option.description),
          }))}
          disabled={pending}
          onChange={onSelect}
        />
      </CardContent>
    </>
  )
}

function CurrencyStep({
  currency,
  pending,
  onSelect,
}: {
  readonly currency: FiatCurrencyType
  readonly pending: boolean
  readonly onSelect: (currency: FiatCurrencyType) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("settings.fiat.mode.title")}</CardTitle>
        <CardDescription>{t("settings.fiat.mode.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <OptionToggleGroup
          value={currency}
          options={currencyOptions.map((option) => ({
            value: option.value,
            icon: BadgeDollarSign,
            title: t(option.label),
            description: t(option.description),
          }))}
          disabled={pending}
          onChange={onSelect}
        />
      </CardContent>
    </>
  )
}

function PaymentsStep({
  iban,
  ibanError,
  ibanInputId,
  paymentMethods,
  pending,
  onIbanChange,
  onTogglePaymentMethod,
}: {
  readonly iban: string
  readonly ibanError: TranslationKey | null
  readonly ibanInputId: string
  readonly paymentMethods: ReadonlySet<OnboardingPaymentMethod>
  readonly pending: boolean
  readonly onIbanChange: (iban: string) => void
  readonly onTogglePaymentMethod: (
    method: OnboardingPaymentMethod,
    checked: boolean
  ) => void
}) {
  const { t } = useTranslation()
  const ibanEnabled = paymentMethods.has("iban")
  const paymentMethodInputId = useId()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.payments.title")}</CardTitle>
        <CardDescription>
          {t("onboarding.payments.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {paymentMethodOptions.map((option) => {
            const Icon = option.icon
            const checked = paymentMethods.has(option.value)
            const inputId = `${paymentMethodInputId}-${option.value}`

            return (
              <Field key={option.value} orientation="horizontal">
                <Checkbox
                  id={inputId}
                  checked={checked}
                  disabled={pending}
                  onCheckedChange={(nextChecked) => {
                    onTogglePaymentMethod(option.value, nextChecked)
                  }}
                />
                <Icon className="text-muted-foreground" />
                <FieldContent>
                  <FieldLabel htmlFor={inputId}>{t(option.label)}</FieldLabel>
                  <FieldDescription>{t(option.description)}</FieldDescription>
                </FieldContent>
              </Field>
            )
          })}

          <Field data-disabled={!ibanEnabled} data-invalid={ibanError !== null}>
            <FieldLabel htmlFor={ibanInputId}>
              {t("settings.fiatBankAccount.iban.label")}
            </FieldLabel>
            <Input
              id={ibanInputId}
              value={iban}
              disabled={pending || !ibanEnabled}
              aria-invalid={ibanError !== null}
              autoComplete="off"
              inputMode="text"
              onChange={(event) => {
                onIbanChange(event.currentTarget.value)
              }}
            />
            <FieldDescription>
              {t("settings.fiatBankAccount.iban.description")}
            </FieldDescription>
            <FieldError>{ibanError ? t(ibanError) : null}</FieldError>
          </Field>
        </FieldGroup>
      </CardContent>
    </>
  )
}

function AccountStep() {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const setEvoluCounter = useSetAtom(evoluCounterAtom)
  const [name, setName] = useState(account.name)
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const nameInputId = useId()

  const saveName = async () => {
    const trimmedName = name.trim()

    if (trimmedName === "") {
      setName(account.name)
      setNameError("onboarding.account.name.error.required")
      return
    }

    setNameError(null)

    if (trimmedName === account.name) {
      return
    }

    await runMutationWithCompletion((options) =>
      updateAccountName(deviceEvolu, account.id, trimmedName, options)
    )
    setEvoluCounter((current) => current + 1)
  }

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.account.title")}</CardTitle>
        <CardDescription>{t("onboarding.account.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <FieldGroup>
            <Field data-invalid={nameError !== null}>
              <FieldLabel htmlFor={nameInputId}>
                {t("onboarding.account.name.label")}
              </FieldLabel>
              <Input
                id={nameInputId}
                value={name}
                aria-invalid={nameError !== null}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.currentTarget.value)
                  setNameError(null)
                }}
                onBlur={() => {
                  void saveName()
                }}
              />
              <FieldDescription>
                {t("onboarding.account.name.description")}
              </FieldDescription>
              <FieldError>{nameError ? t(nameError) : null}</FieldError>
            </Field>
          </FieldGroup>

          <RecoveryPhraseCard mnemonic={account.mnemonic} />

          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.account.transport.title")}</CardTitle>
              <CardDescription>
                {t("onboarding.account.transport.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TransportToggleList accountId={account.id} />
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </>
  )
}

function StepDots({ activeStep }: { readonly activeStep: OnboardingStep }) {
  const activeStepIndex = getStepIndex(activeStep)

  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {onboardingSteps.map((step, index) => (
        <span
          key={step}
          className={cn(
            "size-2 rounded-full bg-muted-foreground/30",
            index === activeStepIndex && "bg-primary"
          )}
        />
      ))}
    </div>
  )
}

function getPaymentMethodOrder(
  paymentMethods: ReadonlySet<OnboardingPaymentMethod>
): ReadonlyArray<DefaultPaymentMethod> {
  const order: DefaultPaymentMethod[] = []

  if (paymentMethods.has("iban")) {
    order.push("iban")
  }

  if (paymentMethods.has("cash")) {
    order.push("cashRegister")
  }

  if (paymentMethods.has("btc")) {
    order.push("spark")
  }

  return order
}

function getDefaultPaymentMethodForOnboarding(
  paymentMethods: ReadonlySet<OnboardingPaymentMethod>
): DefaultPaymentMethod {
  if (paymentMethods.has("btc")) return "spark"
  if (paymentMethods.has("cash")) return "cashRegister"
  return "iban"
}
