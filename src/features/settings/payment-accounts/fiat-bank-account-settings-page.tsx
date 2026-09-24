import { ChevronDown } from "lucide-react"
import { z } from "zod"

import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { FieldDescription, FieldGroup } from "@/components/ui/field.tsx"
import { saveFiatBankAccount } from "@/core/modules/account/account-actions.ts"
import { fiatBankAccountQuery } from "@/core/modules/account/account-queries.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { bankQrFormats } from "@/core/modules/payment/payment-iban-qr-payload-utils.ts"
import { isValidIban } from "@/core/modules/shared/iban-utils.ts"
import {
  BankAccountInputIbanSchema,
  type BankQrFormat,
  BankQrFormatSchema,
  FiatCurrency,
  FiatCurrencySchema,
  type FiatCurrency as FiatCurrencyType,
  type Iban,
} from "@/core/modules/shared/schema.ts"
import { InlineEditField } from "@/features/settings/inline-edit-field.tsx"
import { InlineEditSelect } from "@/features/settings/inline-edit-select.tsx"
import { fiatCurrencyOptions } from "@/features/shared/fiat-currency-options.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * A codec's output side can't be a `.transform()` schema (`z.encode` runs it
 * backwards, and a transform has no backwards to run) — which rules out
 * `IbanSchema` itself, since it normalizes on the way in. This validates the
 * same way (`isValidIban`) without transforming; `decode` below does the
 * actual normalizing before handing off to it.
 */
const ValidatedIbanSchema = z.string().refine(isValidIban).brand<"Iban">()

/**
 * Accepts any bank account input format (IBAN or a Czech account number) and
 * normalizes to IBAN, same as the onboarding flow's validation — but as a
 * codec, so it can drive an `InlineEditField` directly. Blank means "not set
 * yet", matching `optionalDateCodec`'s shape. Decode never throws: an
 * unparseable value passes through untouched so `ValidatedIbanSchema` is the
 * one thing deciding valid vs. invalid, per this file's other codecs.
 */
const optionalIbanCodec = z.codec(z.string(), ValidatedIbanSchema.nullable(), {
  decode: (value) => {
    const trimmed = value.trim()
    if (trimmed === "") return null

    const parsed = BankAccountInputIbanSchema.safeParse(trimmed)
    return parsed.success ? parsed.data : trimmed
  },
  encode: (value) => value ?? "",
})

// Every option value comes from a fixed, locally-built option list (never
// user input), so this cannot realistically fail — a decode error here would
// mean the codec and its options list disagree, not bad input.
const fiatCurrencyCodec = z.codec(z.string(), FiatCurrencySchema, {
  decode: (value) => value as FiatCurrencyType,
  encode: (value) => value,
})

const bankQrFormatCodec = z.codec(z.string(), BankQrFormatSchema, {
  decode: (value) => value as BankQrFormat,
  encode: (value) => value,
})

interface FiatBankAccountQrFormatOption {
  readonly value: BankQrFormat
  readonly label: TranslationKey
}

const fiatBankAccountQrFormatOptions: ReadonlyArray<FiatBankAccountQrFormatOption> =
  bankQrFormats.map((format) => ({
    value: format,
    label: `settings.fiatBankAccount.qrFormat.${format}`,
  }))

export function FiatBankAccountSettingsPage() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data: accountData } = useEvoluQuery(fiatBankAccountQuery)
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [account] = accountData
  const [settings] = settingsData

  const iban = account?.iban ?? null
  // Entering the first IBAN is what setting up bank transfers means, so it
  // enables the account; after that the switch on the overview owns it.
  const enabled = account ? account.isDeleted !== 1 : true
  const currency =
    account?.currency ?? settings?.fiatCurrency ?? FiatCurrency.CZK
  const defaultQrFormat = account?.defaultQrFormat ?? "spayd"

  // `saveFiatBankAccount` upserts the whole row, so a partial save would
  // reset the fields it leaves out. Each control sends the current settings
  // with its own field replaced — same pattern as the FIO plugin form.
  const save = async (changed: {
    readonly iban?: Iban
    readonly currency?: FiatCurrencyType
    readonly defaultQrFormat?: BankQrFormat
  }) => {
    await using run = appRun()
    await run.ok(
      saveFiatBankAccount({
        enabled,
        iban: changed.iban ?? iban ?? undefined,
        currency: changed.currency ?? currency,
        defaultQrFormat: changed.defaultQrFormat ?? defaultQrFormat,
      })
    )
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.paymentAccounts.method.iban")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.fiatBankAccount.form.title")}</CardTitle>
          <CardDescription>
            {t("settings.fiatBankAccount.form.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <InlineEditField
              label={t("settings.fiatBankAccount.iban.label")}
              description={t("settings.fiatBankAccount.iban.description")}
              defaultValue={iban}
              codec={optionalIbanCodec}
              errorKey="settings.fiatBankAccount.iban.invalid"
              onSave={(nextIban) => save({ iban: nextIban ?? undefined })}
            />

            <Collapsible>
              <CollapsibleTrigger className="group/advanced-options flex w-full items-center justify-between text-left text-sm font-medium">
                {t("settings.fiatBankAccount.advanced")}
                <ChevronDown
                  className="size-4 transition-transform group-data-[panel-open]/advanced-options:rotate-180"
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden h-(--collapsible-panel-height) transition-[height] duration-200 ease-out data-starting-style:h-0 data-ending-style:h-0">
                <div className="min-h-0 pt-5">
                  <FieldGroup>
                    <InlineEditSelect
                      label={t("settings.fiatBankAccount.currency.label")}
                      defaultValue={currency}
                      codec={fiatCurrencyCodec}
                      options={fiatCurrencyOptions.map((option) => ({
                        value: option.value,
                        label: t(option.label),
                      }))}
                      onSave={(nextCurrency) =>
                        save({ currency: nextCurrency })
                      }
                    />
                    <FieldDescription>
                      {t("settings.fiatBankAccount.currency.description")}
                    </FieldDescription>

                    <InlineEditSelect
                      label={t("settings.fiatBankAccount.qrFormat.label")}
                      defaultValue={defaultQrFormat}
                      codec={bankQrFormatCodec}
                      options={fiatBankAccountQrFormatOptions.map((option) => ({
                        value: option.value,
                        label: t(option.label),
                      }))}
                      onSave={(nextFormat) =>
                        save({ defaultQrFormat: nextFormat })
                      }
                    />
                    <FieldDescription>
                      {t("settings.fiatBankAccount.qrFormat.description")}
                    </FieldDescription>
                  </FieldGroup>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>
        </CardContent>
      </Card>
    </>
  )
}
