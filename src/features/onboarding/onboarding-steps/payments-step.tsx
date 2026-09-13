import { Banknote, Bitcoin, Landmark } from "lucide-react"
import { useId } from "react"

import {
  CardContent,
  CardDescription,
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
import type { OnboardingPaymentMethod } from "@/features/onboarding/onboarding-form-state.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

interface PaymentMethodOption {
  readonly value: OnboardingPaymentMethod
  readonly label: TranslationKey
  readonly description: TranslationKey
  readonly icon: typeof Banknote
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

export function PaymentsStep({
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
