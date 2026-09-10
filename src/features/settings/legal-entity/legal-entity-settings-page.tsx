import { useEffect, useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { setLegalEntity } from "@/core/modules/legal-entity/legal-entity-actions.ts"
import { legalEntityQuery } from "@/core/modules/legal-entity/legal-entity-queries.ts"
import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/** The settings page's own choice, distinct from the persisted `CountryCode | null`: "OTHER" stays explicit here so it can be told apart from "not chosen yet" (`null`, shown as the select's placeholder). */
type CountrySelection = CountryCode | "OTHER"

const countryOptions: ReadonlyArray<CountrySelection> = ["CZ", "SK", "OTHER"]

export function LegalEntitySettingsPage() {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(legalEntityQuery)
  const [legalEntity] = data

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.legalEntity.title")} />
      <LegalEntitySettingsForm
        country={legalEntity === undefined ? undefined : legalEntity.country}
        vatPayer={legalEntity?.vatPayer === 1}
      />
    </>
  )
}

function LegalEntitySettingsForm({
  country: initialCountry,
  vatPayer: initialVatPayer,
}: {
  /** `undefined` = no `legalEntity` row yet (never configured); `null` = row exists with "other" country. */
  readonly country: CountryCode | null | undefined
  readonly vatPayer: boolean
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const formId = useId()
  const [country, setCountry] = useState<CountrySelection | null>(
    initialCountry === undefined ? null : (initialCountry ?? "OTHER")
  )
  const [countryError, setCountryError] = useState<TranslationKey | null>(null)
  const [vatPayer, setVatPayer] = useState(initialVatPayer)
  const [dirty, setDirty] = useState(false)
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  // Another device can change the synced `legalEntity` row while this form
  // is open. Resync as long as the user hasn't touched the form yet, so an
  // untouched form doesn't submit stale values and clobber that change; once
  // the user edits a field, the incoming row is left alone until save.
  useEffect(() => {
    if (dirty) return
    setCountry(
      initialCountry === undefined ? null : (initialCountry ?? "OTHER")
    )
    setVatPayer(initialVatPayer)
  }, [dirty, initialCountry, initialVatPayer])

  return (
    <SettingsFormCard
      title={t("settings.legalEntity.title")}
      description={t("settings.legalEntity.description")}
      savedMessage={saved ? t("settings.legalEntity.saved") : null}
      submitLabel={t("settings.legalEntity.save")}
      pending={pending}
      onSubmit={(event) => {
        event.preventDefault()

        if (country === null) {
          setCountryError("settings.legalEntity.country.required")
          return
        }

        void submit(async () => {
          await using run = appRun()
          await run(
            setLegalEntity({
              country: country === "OTHER" ? null : country,
              vatPayer,
            })
          )
          setDirty(false)
        })
      }}
    >
      <FieldGroup>
        <Field data-invalid={countryError !== null}>
          <FieldLabel htmlFor={`${formId}-country`}>
            {t("settings.legalEntity.country.label")}
          </FieldLabel>
          <Select<CountrySelection>
            items={Object.fromEntries(
              countryOptions.map((option) => [
                option,
                t(`country.${option.toLowerCase() as "cz" | "sk" | "other"}`),
              ])
            )}
            value={country}
            onValueChange={(nextCountry) => {
              if (nextCountry === null) return
              setCountry(nextCountry)
              setCountryError(null)
              setDirty(true)
              resetSaved()
            }}
          >
            <SelectTrigger
              id={`${formId}-country`}
              disabled={pending}
              aria-invalid={countryError !== null}
            >
              <SelectValue
                placeholder={t("settings.legalEntity.country.placeholder")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {countryOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(
                      `country.${option.toLowerCase() as "cz" | "sk" | "other"}`
                    )}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError>{countryError ? t(countryError) : null}</FieldError>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id={`${formId}-vatPayer`}
            checked={vatPayer}
            disabled={pending}
            onCheckedChange={(checked) => {
              setVatPayer(checked)
              setDirty(true)
              resetSaved()
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${formId}-vatPayer`}>
              {t("settings.legalEntity.vatPayer.label")}
            </FieldLabel>
            <FieldDescription>
              {t("onboarding.country.vatPayer.description")}
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </SettingsFormCard>
  )
}
