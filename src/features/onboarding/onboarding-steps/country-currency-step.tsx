import { useId } from "react"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import type { FiatCurrency as FiatCurrencyType } from "@/core/modules/shared/schema.ts"
import type { OnboardingCountryChoice } from "@/features/onboarding/onboarding-form-state.ts"
import { fiatCurrencyOptions } from "@/features/shared/fiat-currency-options.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

interface CountryOption {
  readonly value: OnboardingCountryChoice
  readonly label: TranslationKey
}

const countryOptions: ReadonlyArray<CountryOption> = [
  { value: "CZ", label: "country.cz" },
  { value: "SK", label: "country.sk" },
  { value: "OTHER", label: "country.other" },
]

/**
 * Country and currency share a screen because the first answers the second:
 * until the merchant picks a currency explicitly, `currency` follows from the
 * country (see `getDefaultCurrencyForCountry`), and on one screen that
 * default visibly moves as the country changes.
 */
export function CountryCurrencyStep({
  country,
  currency,
  pending,
  onSelectCountry,
  onSelectCurrency,
}: {
  readonly country: OnboardingCountryChoice
  readonly currency: FiatCurrencyType
  readonly pending: boolean
  readonly onSelectCountry: (country: OnboardingCountryChoice) => void
  readonly onSelectCurrency: (currency: FiatCurrencyType) => void
}) {
  const { t } = useTranslation()
  const countryInputId = useId()
  const currencyInputId = useId()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.countryCurrency.title")}</CardTitle>
        <CardDescription>
          {t("onboarding.countryCurrency.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={countryInputId}>
              {t("settings.legalEntity.country.label")}
            </FieldLabel>
            <Select<OnboardingCountryChoice>
              items={Object.fromEntries(
                countryOptions.map((option) => [option.value, t(option.label)])
              )}
              value={country}
              disabled={pending}
              onValueChange={(nextCountry: OnboardingCountryChoice | null) => {
                if (nextCountry !== null) {
                  onSelectCountry(nextCountry)
                }
              }}
            >
              <SelectTrigger id={countryInputId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {t("onboarding.countryCurrency.country.description")}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={currencyInputId}>
              {t("onboarding.countryCurrency.currency.label")}
            </FieldLabel>
            <Select<FiatCurrencyType>
              items={Object.fromEntries(
                fiatCurrencyOptions.map((option) => [
                  option.value,
                  t(option.label),
                ])
              )}
              value={currency}
              disabled={pending}
              onValueChange={(nextCurrency: FiatCurrencyType | null) => {
                if (nextCurrency !== null) {
                  onSelectCurrency(nextCurrency)
                }
              }}
            >
              <SelectTrigger id={currencyInputId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fiatCurrencyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {t("onboarding.countryCurrency.currency.description")}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </>
  )
}
