import {
  type BankAccountDisplayFormat,
  czechBankForDraft,
  fiatBankAccountQrFormatOptions,
  optionalIbanCodecs,
} from "@payky/app-shared/bank-account-codecs"
import { fiatCurrencyOptions } from "@payky/app-shared/fiat-currency-options"
import { saveFiatBankAccount } from "@payky/core/modules/account/account-actions"
import { fiatBankAccountQuery } from "@payky/core/modules/account/account-queries"
import type { BankQrFormat } from "@payky/core/modules/account/account-types"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import {
  czechIbanToBban,
  isFioBankIban,
} from "@payky/core/modules/shared/iban-utils"
import type { FiatCurrency, Iban } from "@payky/core/modules/shared/schema"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.tsx"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../../components/ui/toggle-group.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { SettingsRow } from "../settings-row.tsx"

/**
 * The bank transfer account, as web's `FiatBankAccountSettingsPage`: the IBAN
 * (or a Czech account number, normalized to IBAN), its currency and the QR
 * format. Each control writes at once; since `saveFiatBankAccount` upserts the
 * whole row, each sends the current settings with its own field replaced.
 */
export function FiatBankAccountSettingsPage() {
  const runToast = useRunToast()
  const { t } = useTranslation()
  const [account] = useEvoluQuery(fiatBankAccountQuery).data
  const [settings] = useEvoluQuery(settingsQuery).data
  const [ibanFormat, setIbanFormat] = useState<BankAccountDisplayFormat>("bban")

  const iban = account?.iban ?? null
  // Entering the first IBAN is what setting up bank transfers means, so it
  // enables the account; after that the switch on the overview owns it.
  const enabled = account ? account.isDeleted !== 1 : true
  const currency = account?.currency ?? getFiatCurrency(settings)
  const defaultQrFormat = account?.defaultQrFormat ?? "spayd"
  // The bank a saved Czech account belongs to.
  const bank = iban === null ? undefined : czechBankForDraft(iban)

  const save = (changed: {
    readonly iban?: Iban
    readonly currency?: FiatCurrency
    readonly defaultQrFormat?: BankQrFormat
  }) =>
    runToast(async (run) => {
      await run.ok(
        saveFiatBankAccount({
          enabled,
          iban: changed.iban ?? iban ?? undefined,
          currency: changed.currency ?? currency,
          defaultQrFormat: changed.defaultQrFormat ?? defaultQrFormat,
        })
      )
    })

  const currencyChoice = useInlineChoice(currency, (next) =>
    save({ currency: next })
  )
  const qrFormatChoice = useInlineChoice(defaultQrFormat, (next) =>
    save({ defaultQrFormat: next })
  )

  return (
    <Screen>
      <FadeHeader title={t("settings.paymentAccounts.method.iban")} />
      <Text fontWeight="700">{t("settings.fiatBankAccount.form.title")}</Text>
      <Text color="muted-foreground">
        {t("settings.fiatBankAccount.form.description")}
      </Text>

      <InlineEditField
        label={t("settings.fiatBankAccount.iban.label")}
        description={
          bank === undefined
            ? t("settings.fiatBankAccount.iban.description")
            : `${bank ?? t("settings.fiatBankAccount.iban.unknownBank")}\n${t("settings.fiatBankAccount.iban.description")}`
        }
        defaultValue={iban}
        codec={optionalIbanCodecs[ibanFormat]}
        errorKey="settings.fiatBankAccount.iban.invalid"
        onSave={(nextIban) => save({ iban: nextIban ?? undefined })}
      />
      {/* Only saved Czech accounts have two display formats. */}
      {iban !== null && czechIbanToBban(iban) !== null ? (
        <ToggleGroup
          size="sm"
          variant="outline"
          spacing={0}
          value={ibanFormat}
          onValueChange={setIbanFormat}
        >
          {[
            {
              value: "bban",
              title: t("settings.fiatBankAccount.iban.format.bban"),
            },
            {
              value: "iban",
              title: t("settings.fiatBankAccount.iban.format.iban"),
            },
          ].map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.title}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}

      <Text fontWeight="700">{t("settings.fiatBankAccount.advanced")}</Text>
      <YStack gap="2">
        <Text fontWeight="600">
          {t("settings.fiatBankAccount.currency.label")}
        </Text>
        <Select
          value={currencyChoice.value}
          onValueChange={(next) => {
            void currencyChoice.choose(next)
          }}
          items={Object.fromEntries(
            fiatCurrencyOptions.map((option) => [option.value, t(option.label)])
          )}
        >
          <SelectTrigger
            fullWidth
            accessibilityLabel={t("settings.fiatBankAccount.currency.label")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent title={t("settings.fiatBankAccount.currency.label")}>
            {fiatCurrencyOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Text fontSize={13} color="muted-foreground">
          {t("settings.fiatBankAccount.currency.description")}
        </Text>
      </YStack>
      <YStack gap="2">
        <Text fontWeight="600">
          {t("settings.fiatBankAccount.qrFormat.label")}
        </Text>
        <Select
          value={qrFormatChoice.value}
          onValueChange={(next) => {
            void qrFormatChoice.choose(next)
          }}
          items={Object.fromEntries(
            fiatBankAccountQrFormatOptions.map((option) => [
              option.value,
              t(option.label),
            ])
          )}
        >
          <SelectTrigger
            fullWidth
            accessibilityLabel={t("settings.fiatBankAccount.qrFormat.label")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent title={t("settings.fiatBankAccount.qrFormat.label")}>
            {fiatBankAccountQrFormatOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Text fontSize={13} color="muted-foreground">
          {t("settings.fiatBankAccount.qrFormat.description")}
        </Text>
      </YStack>
      <SettingsRow
        title={t("settings.fioPlugin.title")}
        value={t("settings.fioPlugin.description")}
        href="/settings/payment-accounts/iban/fio-plugin"
      />
      {iban !== null && !isFioBankIban(iban) ? (
        <Text fontSize={13} color="muted-foreground">
          {t("settings.fioPlugin.notFioIbanWarning")}
        </Text>
      ) : null}
    </Screen>
  )
}
