import { sqliteTrue } from "@evolu/common"
import { createRun } from "@evolu/web"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
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

import { PhoneViewport } from "@/components/skeleton.tsx"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { getDeviceLocaleForLanguage } from "@/core/evolu/device-client.ts"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import { updateSettings } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
  IbanSchema,
} from "@/core/modules/shared/schema.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
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

type OnboardingStep = "language" | "currency" | "payments"
type PaymentMethod = "cash" | "btc" | "iban"

interface LanguageOption {
  readonly value: Language
  readonly label: string
  readonly description: TranslationKey
}

interface PaymentMethodOption {
  readonly value: PaymentMethod
  readonly label: TranslationKey
  readonly description: TranslationKey
  readonly icon: typeof Banknote
}

interface CurrencyOption {
  readonly value: FiatCurrencyType
  readonly label: TranslationKey
  readonly description: TranslationKey
}

const steps: ReadonlyArray<OnboardingStep> = [
  "language",
  "currency",
  "payments",
]

const languageOptions: ReadonlyArray<LanguageOption> = [
  {
    value: "en",
    label: "English",
    description: "settings.language.english.description",
  },
  {
    value: "cs",
    label: "Čeština",
    description: "settings.language.czech.description",
  },
  {
    value: "sk",
    label: "Slovenčina",
    description: "settings.language.slovak.description",
  },
]

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
    value: FiatCurrency.EUR,
    label: "settings.fiat.eur.title",
    description: "settings.fiat.eur.description",
  },
  {
    value: FiatCurrency.USD,
    label: "settings.fiat.usd.title",
    description: "settings.fiat.usd.description",
  },
  {
    value: FiatCurrency.CZK,
    label: "settings.fiat.czk.title",
    description: "settings.fiat.czk.description",
  },
]

const normalizeIban = (value: string) =>
  value.replaceAll(/\s/gu, "").toUpperCase()

const getStepIndex = (step: OnboardingStep) => steps.indexOf(step)

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
  const console = useConsole()
  const evolu = useEvolu()
  const navigate = useNavigate()
  const setLanguage = useTranslationForLanguage()
  const setLocale = useSetLocale()
  const { language, t } = useTranslation()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const [step, setStep] = useState<OnboardingStep>("language")
  const [selectedCurrency, setSelectedCurrency] = useState<FiatCurrencyType>(
    getDefaultCurrencyForLanguage(language)
  )
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<
    ReadonlySet<PaymentMethod>
  >(() => new Set(["cash", "btc"]))
  const [iban, setIban] = useState("")
  const [ibanError, setIbanError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)
  const ibanInputId = useId()

  useEffect(() => {
    if (settings?.onboardingCompleted === sqliteTrue) {
      void navigate({ to: "/", replace: true })
    }
  }, [navigate, settings?.onboardingCompleted])

  const stepIndex = getStepIndex(step)
  const canGoBack = stepIndex > 0 && !pending

  const goNext = () => {
    const nextStep = steps[stepIndex + 1]
    if (nextStep) {
      setStep(nextStep)
    }
  }

  const goBack = () => {
    const previousStep = steps[stepIndex - 1]
    if (previousStep) {
      setStep(previousStep)
    }
  }

  const togglePaymentMethod = (method: PaymentMethod, checked: boolean) => {
    setSelectedPaymentMethods((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(method)
      } else {
        next.delete(method)
      }
      return next
    })
    setIbanError(null)
  }

  const finishOnboarding = async () => {
    setIbanError(null)

    const ibanEnabled = selectedPaymentMethods.has("iban")
    const normalizedIban = normalizeIban(iban)
    const ibanResult = normalizedIban
      ? IbanSchema.safeParse(normalizedIban)
      : null

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

      await using run = createRun({
        console,
        evolu,
        evoluOwnerId: evolu.appOwner.id,
      })

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
        updateSettings({
          onboardingCompleted: sqliteTrue,
          fiatCurrency: selectedCurrency,
          defaultPaymentMethod: getDefaultPaymentMethodForOnboarding(
            selectedPaymentMethods
          ),
          paymentMethodOrderJson: JSON.stringify(
            getPaymentMethodOrder(selectedPaymentMethods)
          ),
        })
      )

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
                {t("onboarding.progress")} {stepIndex + 1}/{steps.length}
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
                  setSelectedCurrency(
                    getDefaultCurrencyForLanguage(nextLanguage)
                  )
                }}
              />
            ) : null}

            {step === "currency" ? (
              <CurrencyStep
                currency={selectedCurrency}
                pending={pending}
                onSelect={setSelectedCurrency}
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
                  setIban(nextIban)
                  setIbanError(null)
                }}
                onTogglePaymentMethod={togglePaymentMethod}
              />
            ) : null}

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
              {step === "payments" ? (
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
        <ToggleGroup<Language>
          value={[language]}
          onValueChange={(nextValue) => {
            const [nextLanguage] = nextValue
            if (nextLanguage) {
              onSelect(nextLanguage)
            }
          }}
          spacing={2}
          className="grid w-full grid-cols-1"
          orientation="vertical"
          variant="outline"
          disabled={pending}
        >
          {languageOptions.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="flex h-auto justify-start gap-6 px-6 py-4 text-left"
            >
              <Languages className="text-muted-foreground" />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{option.label}</span>
                <span className="text-muted-foreground text-xs leading-snug">
                  {t(option.description)}
                </span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
        <ToggleGroup<FiatCurrencyType>
          value={[currency]}
          onValueChange={(nextValue) => {
            const [nextCurrency] = nextValue
            if (
              nextCurrency === FiatCurrency.CZK ||
              nextCurrency === FiatCurrency.EUR ||
              nextCurrency === FiatCurrency.USD
            ) {
              onSelect(nextCurrency)
            }
          }}
          spacing={2}
          className="grid w-full grid-cols-1"
          orientation="vertical"
          variant="outline"
          disabled={pending}
        >
          {currencyOptions.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="flex h-auto justify-start gap-6 px-6 py-4 text-left"
            >
              <BadgeDollarSign className="text-muted-foreground" />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{t(option.label)}</span>
                <span className="text-muted-foreground text-xs leading-snug">
                  {t(option.description)}
                </span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
  readonly paymentMethods: ReadonlySet<PaymentMethod>
  readonly pending: boolean
  readonly onIbanChange: (iban: string) => void
  readonly onTogglePaymentMethod: (
    method: PaymentMethod,
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

function StepDots({ activeStep }: { readonly activeStep: OnboardingStep }) {
  const activeStepIndex = getStepIndex(activeStep)

  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {steps.map((step, index) => (
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
  paymentMethods: ReadonlySet<PaymentMethod>
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
  paymentMethods: ReadonlySet<PaymentMethod>
): DefaultPaymentMethod {
  if (paymentMethods.has("btc")) return "spark"
  if (paymentMethods.has("cash")) return "cashRegister"
  return "iban"
}
