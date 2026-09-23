import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { FieldGroup } from "@/components/ui/field.tsx"
import { setLegalEntity } from "@/core/modules/legal-entity/legal-entity-actions.ts"
import { legalEntityQuery } from "@/core/modules/legal-entity/legal-entity-queries.ts"
import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import { InlineEditCheckbox } from "@/features/settings/inline-edit-checkbox.tsx"
import { optionalIdCodec } from "@/features/settings/inline-edit-codecs.ts"
import { InlineEditSelect } from "@/features/settings/inline-edit-select.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The settings page's own choice, distinct from the persisted
 * `CountryCode | null`: "OTHER" stays explicit here so it can be told apart
 * from "not chosen yet", which is the row not existing at all.
 */
const OTHER_COUNTRY = "OTHER"

const countryOptions: ReadonlyArray<CountryCode | typeof OTHER_COUNTRY> = [
  "CZ",
  "SK",
  OTHER_COUNTRY,
]

const countryCodec = optionalIdCodec<CountryCode>(OTHER_COUNTRY)

export function LegalEntitySettingsPage() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data } = useEvoluQuery(legalEntityQuery)
  const [legalEntity] = data

  const vatPayer = legalEntity?.vatPayer === 1

  // `setLegalEntity` always writes both fields, so each control carries the
  // other one along unchanged.
  const save = async (values: {
    readonly country: CountryCode | null
    readonly vatPayer: boolean
  }) => {
    await using run = appRun()
    await run(setLegalEntity(values))
  }

  return (
    <>
      <div className="h-6" />
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
            <InlineEditSelect
              label={t("settings.legalEntity.country.label")}
              placeholder={t("settings.legalEntity.country.placeholder")}
              defaultValue={
                legalEntity === undefined ? undefined : legalEntity.country
              }
              codec={countryCodec}
              options={countryOptions.map((option) => ({
                value: option,
                label: t(
                  `country.${option.toLowerCase() as "cz" | "sk" | "other"}`
                ),
              }))}
              onSave={(country) => save({ country, vatPayer })}
            />

            <InlineEditCheckbox
              label={t("settings.legalEntity.vatPayer.label")}
              description={t("settings.legalEntity.vatPayer.description")}
              defaultValue={vatPayer}
              // The country comes first: saving this while none is chosen
              // would write "other" on the user's behalf, which is what the
              // old form's "country required" error existed to prevent.
              disabled={legalEntity === undefined}
              onSave={(nextVatPayer) =>
                save({
                  country: legalEntity?.country ?? null,
                  vatPayer: nextVatPayer,
                })
              }
            />
          </FieldGroup>
        </CardContent>
      </Card>
    </>
  )
}
