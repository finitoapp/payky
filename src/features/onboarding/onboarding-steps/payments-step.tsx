import { Banknote, Bitcoin, Landmark } from "lucide-react"
import { useId } from "react"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Switch } from "@/components/ui/switch.tsx"
import type { OnboardingPaymentMethod } from "@/features/onboarding/onboarding-form-state.ts"
import { BankAccountDescription } from "@/features/shared/bank-account-input.tsx"
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
]

export function PaymentsStep({
  iban,
  ibanError,
  ibanInputId,
  paymentMethods,
  paymentMethodsError,
  pending,
  onIbanChange,
  onTogglePaymentMethod,
}: {
  readonly iban: string
  readonly ibanError: TranslationKey | null
  readonly ibanInputId: string
  readonly paymentMethodsError: TranslationKey | null
  readonly paymentMethods: ReadonlySet<OnboardingPaymentMethod>
  readonly pending: boolean
  readonly onIbanChange: (iban: string) => void
  readonly onTogglePaymentMethod: (
    method: OnboardingPaymentMethod,
    checked: boolean
  ) => void
}) {
  const { t } = useTranslation()
  const paymentMethodInputId = useId()

  return (
    <FieldSet
      aria-invalid={paymentMethodsError !== null}
      aria-describedby={
        paymentMethodsError ? `${paymentMethodInputId}-error` : undefined
      }
    >
      <FieldLegend className="sr-only">
        {t("onboarding.payments.methodsTitle")}
      </FieldLegend>
      <FieldGroup className="gap-4">
        {paymentMethodOptions.map((option) => {
          const Icon = option.icon
          const checked = paymentMethods.has(option.value)
          const inputId = `${paymentMethodInputId}-${option.value}`

          return (
            <Field
              key={option.value}
              orientation="horizontal"
              data-disabled={pending}
              className="items-center gap-3"
            >
              <FieldLabel
                htmlFor={inputId}
                className="flex-1 min-h-14 items-center gap-3 py-2"
              >
                <Icon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <span className="flex flex-col gap-1">
                  <span id={`${inputId}-label`}>{t(option.label)}</span>
                  <span
                    id={`${inputId}-description`}
                    className="text-sm font-normal leading-relaxed text-muted-foreground"
                  >
                    {t(option.description)}
                  </span>
                </span>
              </FieldLabel>
              <Switch
                id={inputId}
                checked={checked}
                disabled={pending}
                aria-labelledby={`${inputId}-label`}
                aria-describedby={`${inputId}-description`}
                onCheckedChange={(nextChecked) => {
                  onTogglePaymentMethod(option.value, nextChecked)
                }}
              />
            </Field>
          )
        })}

        <Field
          className="pt-2"
          data-disabled={pending}
          data-invalid={ibanError !== null}
        >
          <FieldLabel htmlFor={ibanInputId} className="gap-3">
            <Landmark
              aria-hidden="true"
              className="size-5 shrink-0 text-muted-foreground"
            />
            {t("onboarding.payments.iban.title")}
          </FieldLabel>
          <div className="flex flex-col gap-2 pl-8">
            <Input
              id={ibanInputId}
              value={iban}
              disabled={pending}
              aria-invalid={ibanError !== null}
              aria-describedby={
                ibanError
                  ? `${ibanInputId}-error`
                  : `${ibanInputId}-description`
              }
              autoComplete="off"
              inputMode="text"
              onChange={(event) => {
                onIbanChange(event.currentTarget.value)
              }}
            />
            <FieldDescription id={`${ibanInputId}-description`}>
              <BankAccountDescription
                draft={iban}
                descriptionKey="onboarding.payments.iban.description"
              />
            </FieldDescription>
            <FieldError id={`${ibanInputId}-error`}>
              {ibanError ? t(ibanError) : null}
            </FieldError>
          </div>
        </Field>
      </FieldGroup>
      <FieldError id={`${paymentMethodInputId}-error`}>
        {paymentMethodsError ? t(paymentMethodsError) : null}
      </FieldError>
    </FieldSet>
  )
}
