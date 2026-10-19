import { fiatCurrencyOptions } from "@payky/app-shared/fiat-currency-options"
import {
  countryCodec,
  countryLabelKey,
  countryOptions,
  OTHER_COUNTRY,
} from "@payky/app-shared/legal-entity-options"
import { updateSettings } from "@payky/core/modules/app-settings/app-settings-actions"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { setLegalEntity } from "@payky/core/modules/legal-entity/legal-entity-actions"
import { legalEntityQuery } from "@payky/core/modules/legal-entity/legal-entity-queries"
import type { CountryCode } from "@payky/core/modules/legal-entity/legal-entity-types"
import { Text } from "tamagui"
import { z } from "zod"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { Checkbox } from "../../../components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../../components/ui/field.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Country, accounting currency and VAT status, as web's
 * `LegalEntitySettingsPage`; every choice is written at once.
 */
export function LegalEntitySettingsPage() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [legalEntity] = useEvoluQuery(legalEntityQuery).data
  const [settings] = useEvoluQuery(settingsQuery).data
  const vatPayer = legalEntity?.vatPayer === 1

  // `setLegalEntity` always writes both fields, so each control carries the
  // other one along unchanged.
  const save = (values: {
    readonly country: CountryCode | null
    readonly vatPayer: boolean
  }) =>
    runToast(async (run) => {
      await run.ok(setLegalEntity(values))
    })

  const country = useInlineChoice<CountryCode | null | undefined>(
    legalEntity === undefined ? undefined : legalEntity.country,
    async (next) =>
      next === undefined ? false : save({ country: next, vatPayer })
  )
  const currency = useInlineChoice(getFiatCurrency(settings), (fiatCurrency) =>
    runToast(async (run) => {
      await run.ok(updateSettings({ fiatCurrency }))
    })
  )
  const vat = useInlineChoice(vatPayer, (next) =>
    save({ country: legalEntity?.country ?? null, vatPayer: next })
  )

  return (
    <Screen>
      <FadeHeader title={t("settings.legalEntity.title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.legalEntity.title")}</CardTitle>
          <CardDescription>
            {t("settings.legalEntity.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>{t("settings.legalEntity.country.label")}</FieldLabel>
              {country.value === undefined ? (
                <Text color="muted-foreground">
                  {t("settings.legalEntity.country.placeholder")}
                </Text>
              ) : null}
              {/* Nothing is selected until a country is chosen: the row does not exist. */}
              <Select
                value={
                  country.value === undefined
                    ? ""
                    : z.encode(countryCodec, country.value)
                }
                onValueChange={(value) => {
                  const parsed = z.safeDecode(countryCodec, value)
                  if (parsed.success) void country.choose(parsed.data)
                }}
                items={Object.fromEntries(
                  countryOptions
                    .map((option) => ({
                      value: option,
                      title: t(
                        countryLabelKey(
                          option === OTHER_COUNTRY ? null : option
                        )
                      ),
                    }))
                    .map((option) => [option.value, option.title])
                )}
              >
                <SelectTrigger
                  fullWidth
                  accessibilityLabel={t("settings.legalEntity.country.label")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent title={t("settings.legalEntity.country.label")}>
                  {countryOptions
                    .map((option) => ({
                      value: option,
                      title: t(
                        countryLabelKey(
                          option === OTHER_COUNTRY ? null : option
                        )
                      ),
                    }))
                    .map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>
                {t("settings.legalEntity.currency.label")}
              </FieldLabel>
              <Select
                value={currency.value}
                onValueChange={(value) => void currency.choose(value)}
                items={Object.fromEntries(
                  fiatCurrencyOptions.map((option) => [
                    option.value,
                    t(option.label),
                  ])
                )}
              >
                <SelectTrigger
                  fullWidth
                  accessibilityLabel={t("settings.legalEntity.currency.label")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent title={t("settings.legalEntity.currency.label")}>
                  {fiatCurrencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t("settings.legalEntity.currency.description")}
              </FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                checked={vat.value}
                accessibilityLabel={t("settings.legalEntity.vatPayer.label")}
                // The country comes first: saving this while none is chosen
                // would write "other" on the user's behalf.
                disabled={legalEntity === undefined || vat.saving}
                onCheckedChange={(next) => void vat.choose(next)}
              />
              <FieldContent>
                <FieldLabel>
                  {t("settings.legalEntity.vatPayer.label")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.legalEntity.vatPayer.description")}
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </Screen>
  )
}
