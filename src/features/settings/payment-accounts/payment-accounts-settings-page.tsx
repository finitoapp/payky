import { useEffect, useId, useState } from "react"
import { z } from "zod"

import { FadeHeader } from "@/components/fade-header.tsx"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
import {
  Card,
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
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
  updateSparkAccountSyncPointer,
} from "@/core/modules/account/account-actions.ts"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { sparkAccountSyncPointerByAccountIdQuery } from "@/core/modules/account/account-spark-queries.ts"
import { sparkAccountId } from "@/core/modules/account/account-utils.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { bankQrFormats } from "@/core/modules/payment/payment-iban-qr-payload-utils.ts"
import { isValidIban } from "@/core/modules/shared/iban-utils.ts"
import { sparkSecretToMnemonic } from "@/core/modules/shared/key-derivation.ts"
import {
  BankAccountInputIbanSchema,
  type BankQrFormat,
  BankQrFormatSchema,
  FiatCurrency,
  FiatCurrencySchema,
  type FiatCurrency as FiatCurrencyType,
  type Iban,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import { createDefaultSparkPaymentWallet } from "@/core/spark/spark-wallet.ts"
import { InlineEditCheckbox } from "@/features/settings/inline-edit-checkbox.tsx"
import { timestampMsDateCodec } from "@/features/settings/inline-edit-codecs.ts"
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

export function PaymentAccountsSettingsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.paymentAccounts.title")} />
      <div className="flex flex-col gap-5">
        <FiatBankAccountCard />
        <SparkAccountCard />
        <CashRegisterAccountCard />
      </div>
    </>
  )
}

function FiatBankAccountCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data: accountData } = useEvoluQuery(fiatBankAccountQuery)
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [account] = accountData
  const [settings] = settingsData

  // An IBAN row is what `fiatBankAccountQuery`'s inner join requires to
  // return anything, so its presence is exactly "has a bank account ever
  // been configured" — enabling one with nothing configured yet would leave
  // an active-looking account with no actual IBAN, which is why the checkbox
  // below stays disabled until this is true.
  const hasIban = account !== undefined
  const enabled = account ? account.isDeleted !== 1 : false
  const iban = account?.iban ?? null
  const currency =
    account?.currency ?? settings?.fiatCurrency ?? FiatCurrency.CZK
  const defaultQrFormat = account?.defaultQrFormat ?? "spayd"

  // `saveFiatBankAccount` upserts the whole row, so a partial save would
  // reset the fields it leaves out. Each control sends the current settings
  // with its own field replaced — same pattern as the FIO plugin form.
  const save = async (changed: {
    readonly enabled?: boolean
    readonly iban?: Iban
    readonly currency?: FiatCurrencyType
    readonly defaultQrFormat?: BankQrFormat
  }) => {
    await using run = appRun()
    await run(
      saveFiatBankAccount({
        enabled: changed.enabled ?? enabled,
        iban: changed.iban ?? iban ?? undefined,
        currency: changed.currency ?? currency,
        defaultQrFormat: changed.defaultQrFormat ?? defaultQrFormat,
      })
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.fiatBankAccount.form.title")}</CardTitle>
        <CardDescription>
          {t("settings.fiatBankAccount.form.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <InlineEditCheckbox
            label={t("settings.fiatBankAccount.enabled.label")}
            description={t("settings.fiatBankAccount.enabled.description")}
            defaultValue={enabled}
            disabled={!hasIban}
            onSave={(nextEnabled) => save({ enabled: nextEnabled })}
          />

          <InlineEditField
            label={t("settings.fiatBankAccount.iban.label")}
            description={t("settings.fiatBankAccount.iban.description")}
            defaultValue={iban}
            codec={optionalIbanCodec}
            errorKey="settings.fiatBankAccount.iban.invalid"
            onSave={(nextIban) => save({ iban: nextIban ?? undefined })}
          />

          <InlineEditSelect
            label={t("settings.fiatBankAccount.currency.label")}
            defaultValue={currency}
            codec={fiatCurrencyCodec}
            options={fiatCurrencyOptions.map((option) => ({
              value: option.value,
              label: t(option.label),
            }))}
            onSave={(nextCurrency) => save({ currency: nextCurrency })}
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
            onSave={(nextFormat) => save({ defaultQrFormat: nextFormat })}
          />
          <FieldDescription>
            {t("settings.fiatBankAccount.qrFormat.description")}
          </FieldDescription>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function SparkAccountCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const mnemonicId = useId()
  const { data: accountData } = useEvoluQuery(sparkAccountQuery)
  const [account] = accountData
  const { data: pointers } = useEvoluQuery(
    sparkAccountSyncPointerByAccountIdQuery(sparkAccountId)
  )
  const [pointer] = pointers
  const [privacyMode, setPrivacyMode] = useState(false)
  const [privacyModeError, setPrivacyModeError] =
    useState<TranslationKey | null>(null)
  const [privacyModePending, setPrivacyModePending] = useState(false)

  const enabled = account ? account.isDeleted !== 1 : false
  const secret = account?.secret ?? null

  useEffect(() => {
    let active = true

    setPrivacyModeError(null)

    if (secret === null) {
      setPrivacyMode(false)
      setPrivacyModePending(false)
      return
    }

    const loadPrivacyMode = async () => {
      setPrivacyModePending(true)

      try {
        await using wallet = await createDefaultSparkPaymentWallet(secret)
        const walletSettings = await wallet.getWalletSettings()

        if (active) {
          setPrivacyMode(walletSettings?.privateEnabled ?? false)
        }
      } catch {
        if (active) {
          setPrivacyModeError("settings.sparkAccount.privacyMode.loadError")
        }
      } finally {
        if (active) {
          setPrivacyModePending(false)
        }
      }
    }

    void loadPrivacyMode()

    return () => {
      active = false
    }
  }, [secret])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.sparkAccount.form.title")}</CardTitle>
        <CardDescription>
          {t("settings.sparkAccount.form.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <InlineEditCheckbox
            label={t("settings.sparkAccount.enabled.label")}
            description={t("settings.sparkAccount.enabled.description")}
            defaultValue={enabled}
            onSave={async (nextEnabled) => {
              await using run = appRun()
              await run.ok(saveSparkAccount({ enabled: nextEnabled }))
            }}
          />

          {secret !== null && (
            <Field>
              <FieldLabel htmlFor={mnemonicId}>
                {t("settings.sparkAccount.mnemonic.label")}
              </FieldLabel>
              <PasswordTextarea
                id={mnemonicId}
                value={sparkSecretToMnemonic(secret)}
                hideLabel={t("passwordTextarea.hide")}
                showLabel={t("passwordTextarea.show")}
                readOnly
                aria-readonly="true"
                autoComplete="off"
              />
              <FieldDescription>
                {t("settings.sparkAccount.mnemonic.description")}
              </FieldDescription>
            </Field>
          )}

          <InlineEditCheckbox
            label={t("settings.sparkAccount.privacyMode.label")}
            description={
              privacyModeError
                ? t(privacyModeError)
                : privacyModePending
                  ? t("settings.sparkAccount.privacyMode.loading")
                  : t("settings.sparkAccount.privacyMode.description")
            }
            defaultValue={privacyMode}
            disabled={secret === null || privacyModePending}
            onSave={async (nextPrivacyMode) => {
              if (secret === null) return

              await using wallet = await createDefaultSparkPaymentWallet(secret)
              const walletSettings =
                await wallet.setPrivacyEnabled(nextPrivacyMode)

              if (!walletSettings) {
                throw new Error("Failed to save Spark privacy mode.")
              }

              setPrivacyMode(walletSettings.privateEnabled)
            }}
          />

          {secret !== null && (
            <InlineEditField
              label={t("settings.sparkAccount.syncPointer.label")}
              description={t("settings.sparkAccount.syncPointer.description")}
              type="date"
              defaultValue={pointer?.lastSyncedAt ?? TimestampMs(Date.now())}
              codec={timestampMsDateCodec}
              errorKey="settings.sparkAccount.syncPointer.invalid"
              onSave={async (nextLastSyncedAt) => {
                await using run = appRun()
                await run.ok(
                  updateSparkAccountSyncPointer({
                    id: sparkAccountId,
                    lastSyncedAt: nextLastSyncedAt,
                  })
                )
              }}
            />
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function CashRegisterAccountCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data: accountData } = useEvoluQuery(cashRegisterAccountQuery)
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [account] = accountData
  const [settings] = settingsData

  const enabled = account ? account.isDeleted !== 1 : false

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.cashRegisterAccount.form.title")}</CardTitle>
        <CardDescription>
          {t("settings.cashRegisterAccount.form.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <InlineEditCheckbox
            label={t("settings.cashRegisterAccount.enabled.label")}
            description={t("settings.cashRegisterAccount.enabled.description")}
            defaultValue={enabled}
            onSave={async (nextEnabled) => {
              await using run = appRun()
              await run(
                saveCashRegisterAccount({
                  enabled: nextEnabled,
                  currency: settings?.fiatCurrency ?? FiatCurrency.CZK,
                })
              )
            }}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
