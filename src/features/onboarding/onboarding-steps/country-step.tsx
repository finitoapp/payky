import { Globe } from "lucide-react"
import { useId } from "react"
import { OptionToggleGroup } from "@/components/option-toggle-group.tsx"
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import type { OnboardingCountryChoice } from "@/features/onboarding/onboarding-form-state.ts"
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

export function CountryStep({
  country,
  vatPayer,
  pending,
  onSelectCountry,
  onChangeVatPayer,
}: {
  readonly country: OnboardingCountryChoice | null
  readonly vatPayer: boolean | null
  readonly pending: boolean
  readonly onSelectCountry: (country: OnboardingCountryChoice) => void
  readonly onChangeVatPayer: (vatPayer: boolean) => void
}) {
  const { t } = useTranslation()
  const vatPayerInputId = useId()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.country.title")}</CardTitle>
        <CardDescription>{t("onboarding.country.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <OptionToggleGroup
            value={country}
            options={countryOptions.map((option) => ({
              value: option.value,
              icon: Globe,
              title: t(option.label),
            }))}
            disabled={pending}
            onChange={onSelectCountry}
          />

          <Field orientation="horizontal">
            <Checkbox
              id={vatPayerInputId}
              checked={vatPayer === true}
              disabled={pending}
              onCheckedChange={(checked) => {
                onChangeVatPayer(checked)
              }}
            />
            <FieldContent>
              <FieldLabel htmlFor={vatPayerInputId}>
                {t("onboarding.country.vatPayer.label")}
              </FieldLabel>
              <FieldDescription>
                {t("onboarding.country.vatPayer.description")}
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </CardContent>
    </>
  )
}
