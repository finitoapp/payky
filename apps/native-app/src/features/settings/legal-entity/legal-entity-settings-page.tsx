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
import { Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { z } from "zod"
import { OptionSelect } from "../../../components/option-select.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
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
      <ScreenHeader title={t("settings.legalEntity.title")} />
      <Text color="muted-foreground">
        {t("settings.legalEntity.description")}
      </Text>

      <YStack gap="2">
        <Text fontWeight="700">{t("settings.legalEntity.country.label")}</Text>
        {country.value === undefined ? (
          <Text color="muted-foreground">
            {t("settings.legalEntity.country.placeholder")}
          </Text>
        ) : null}
        <OptionSelect<string>
          // Nothing is selected until a country is chosen: the row does not exist.
          value={
            country.value === undefined
              ? ""
              : z.encode(countryCodec, country.value)
          }
          options={countryOptions.map((option) => ({
            value: option,
            title: t(countryLabelKey(option === OTHER_COUNTRY ? null : option)),
          }))}
          onChange={(value) => {
            const parsed = z.safeDecode(countryCodec, value)
            if (parsed.success) void country.choose(parsed.data)
          }}
        />
      </YStack>

      <YStack gap="2">
        <Text fontWeight="700">{t("settings.legalEntity.currency.label")}</Text>
        <OptionSelect
          value={currency.value}
          options={fiatCurrencyOptions.map((option) => ({
            value: option.value,
            title: t(option.label),
          }))}
          onChange={(value) => void currency.choose(value)}
        />
        <Text fontSize={13} color="muted-foreground">
          {t("settings.legalEntity.currency.description")}
        </Text>
      </YStack>

      <XStack gap="3" items="center">
        <Switch
          accessibilityLabel={t("settings.legalEntity.vatPayer.label")}
          value={vat.value}
          // The country comes first: saving this while none is chosen would
          // write "other" on the user's behalf.
          disabled={legalEntity === undefined || vat.saving}
          onValueChange={(next) => void vat.choose(next)}
        />
        <YStack flex={1}>
          <Text fontWeight="600">
            {t("settings.legalEntity.vatPayer.label")}
          </Text>
          <Text fontSize={13} color="muted-foreground">
            {t("settings.legalEntity.vatPayer.description")}
          </Text>
        </YStack>
      </XStack>
    </Screen>
  )
}
