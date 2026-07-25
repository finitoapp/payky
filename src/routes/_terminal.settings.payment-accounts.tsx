import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { normalizeMnemonic } from "@/core/modules/account/account-utils.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  bankQrFormats,
  isBankQrFormat,
} from "@/core/modules/payment/payment-iban-qr-payload-utils.ts"
import {
  BankAccountInputIbanSchema,
  type BankQrFormat,
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
  NonEmptyString255Schema,
} from "@/core/modules/shared/schema.ts"
import { createDefaultSparkPaymentWallet } from "@/core/spark/spark-wallet.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/payment-accounts")({
  component: PaymentAccountsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

interface FiatBankAccountCurrencyOption {
  readonly value: FiatCurrencyType
  readonly label: TranslationKey
}

interface FiatBankAccountQrFormatOption {
  readonly value: BankQrFormat
  readonly label: TranslationKey
}

const fiatBankAccountCurrencyOptions: ReadonlyArray<FiatBankAccountCurrencyOption> =
  [
    {
      value: FiatCurrency.EUR,
      label: "settings.fiat.eur.title",
    },
    {
      value: FiatCurrency.USD,
      label: "settings.fiat.usd.title",
    },
    {
      value: FiatCurrency.CZK,
      label: "settings.fiat.czk.title",
    },
  ]

const fiatBankAccountQrFormatOptions: ReadonlyArray<FiatBankAccountQrFormatOption> =
  bankQrFormats.map((format) => ({
    value: format,
    label: `settings.fiatBankAccount.qrFormat.${format}` as TranslationKey,
  }))

function PaymentAccountsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.paymentAccounts.title")} />
      <div className="flex flex-col gap-5">
        <FiatBankAccountForm />
        <SparkAccountForm />
        <CashRegisterAccountForm />
      </div>
    </>
  )
}

function FiatBankAccountForm() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const ibanInputId = useId()
  const enabledInputId = useId()
  const currencyInputId = useId()
  const qrFormatInputId = useId()
  const { data: accountData } = useEvoluQuery(fiatBankAccountQuery)
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [account] = accountData
  const [settings] = settingsData
  const [enabled, setEnabled] = useState(false)
  const [iban, setIban] = useState("")
  const [currency, setCurrency] = useState<FiatCurrencyType>(FiatCurrency.CZK)
  const [defaultQrFormat, setDefaultQrFormat] = useState<BankQrFormat>("spayd")
  const { pending, saved, error, setError, resetSaved, submit } =
    useSettingsForm()

  useEffect(() => {
    setEnabled(account ? account.isDeleted !== 1 : false)
    setIban(account?.iban ?? "")
    setCurrency(account?.currency ?? settings?.fiatCurrency ?? FiatCurrency.CZK)
    setDefaultQrFormat(account?.defaultQrFormat ?? "spayd")
  }, [account, settings?.fiatCurrency])

  return (
    <SettingsFormCard
      title={t("settings.fiatBankAccount.form.title")}
      description={t("settings.fiatBankAccount.form.description")}
      savedMessage={saved ? t("settings.fiatBankAccount.saved") : null}
      submitLabel={t("settings.fiatBankAccount.save")}
      pending={pending}
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        resetSaved()

        const ibanResult =
          iban === "" ? null : BankAccountInputIbanSchema.safeParse(iban)

        if (enabled && !ibanResult) {
          setError("settings.fiatBankAccount.iban.required")
          return
        }

        if (ibanResult?.success === false) {
          setError("settings.fiatBankAccount.iban.invalid")
          return
        }

        void submit(async () => {
          await using run = appRun()

          await run(
            saveFiatBankAccount({
              enabled,
              iban: ibanResult?.data,
              currency,
              defaultQrFormat,
            })
          )

          setIban(ibanResult?.data ?? "")
        })
      }}
    >
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id={enabledInputId}
            checked={enabled}
            disabled={pending}
            onCheckedChange={setEnabled}
          />
          <FieldContent>
            <FieldLabel htmlFor={enabledInputId}>
              {t("settings.fiatBankAccount.enabled.label")}
            </FieldLabel>
            <FieldDescription>
              {t("settings.fiatBankAccount.enabled.description")}
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor={ibanInputId}>
            {t("settings.fiatBankAccount.iban.label")}
          </FieldLabel>
          <Input
            id={ibanInputId}
            value={iban}
            disabled={pending}
            aria-invalid={error !== null}
            autoComplete="off"
            inputMode="text"
            onChange={(event) => {
              setIban(event.currentTarget.value)
              setError(null)
              resetSaved()
            }}
          />
          <FieldDescription>
            {t("settings.fiatBankAccount.iban.description")}
          </FieldDescription>
          <FieldError>{error ? t(error) : null}</FieldError>
        </Field>

        <Field>
          <FieldLabel id={currencyInputId}>
            {t("settings.fiatBankAccount.currency.label")}
          </FieldLabel>
          <ToggleGroup<FiatCurrencyType>
            aria-labelledby={currencyInputId}
            value={[currency]}
            onValueChange={(value) => {
              const [nextCurrency] = value
              if (
                nextCurrency === FiatCurrency.EUR ||
                nextCurrency === FiatCurrency.USD ||
                nextCurrency === FiatCurrency.CZK
              ) {
                setCurrency(nextCurrency)
                resetSaved()
              }
            }}
            variant="outline"
            spacing={0}
            className="grid w-full grid-cols-1"
            orientation="vertical"
          >
            {fiatBankAccountCurrencyOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="w-full justify-start px-4"
              >
                {t(option.label)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>
            {t("settings.fiatBankAccount.currency.description")}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel id={qrFormatInputId}>
            {t("settings.fiatBankAccount.qrFormat.label")}
          </FieldLabel>
          <ToggleGroup<BankQrFormat>
            aria-labelledby={qrFormatInputId}
            value={[defaultQrFormat]}
            onValueChange={(value) => {
              const [nextFormat] = value
              if (isBankQrFormat(nextFormat)) {
                setDefaultQrFormat(nextFormat)
                resetSaved()
              }
            }}
            variant="outline"
            spacing={0}
            className="grid"
            orientation="vertical"
          >
            {fiatBankAccountQrFormatOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="w-full justify-start px-4"
              >
                {t(option.label)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>
            {t("settings.fiatBankAccount.qrFormat.description")}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </SettingsFormCard>
  )
}

function SparkAccountForm() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const enabledInputId = useId()
  const mnemonicInputId = useId()
  const privacyModeInputId = useId()
  const { data: accountData } = useEvoluQuery(sparkAccountQuery)
  const [account] = accountData
  const [enabled, setEnabled] = useState(false)
  const [mnemonic, setMnemonic] = useState("")
  const [privacyMode, setPrivacyMode] = useState(false)
  const [privacyModeError, setPrivacyModeError] =
    useState<TranslationKey | null>(null)
  const [privacyModePending, setPrivacyModePending] = useState(false)
  const { pending, saved, error, setError, resetSaved, submit } =
    useSettingsForm()

  useEffect(() => {
    setEnabled(account ? account.isDeleted !== 1 : false)
    setMnemonic(account?.mnemonic ?? "")
  }, [account])

  useEffect(() => {
    const accountMnemonic = account?.mnemonic
    let active = true

    setPrivacyModeError(null)

    if (!accountMnemonic) {
      setPrivacyMode(false)
      setPrivacyModePending(false)
      return
    }

    const loadPrivacyMode = async () => {
      setPrivacyModePending(true)

      try {
        await using wallet =
          await createDefaultSparkPaymentWallet(accountMnemonic)
        const settings = await wallet.getWalletSettings()

        if (active) {
          setPrivacyMode(settings?.privateEnabled ?? false)
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
  }, [account?.mnemonic])

  return (
    <SettingsFormCard
      title={t("settings.sparkAccount.form.title")}
      description={t("settings.sparkAccount.form.description")}
      savedMessage={saved ? t("settings.sparkAccount.saved") : null}
      submitLabel={t("settings.sparkAccount.save")}
      pending={pending}
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        setPrivacyModeError(null)
        resetSaved()

        const normalizedMnemonic = normalizeMnemonic(mnemonic)
        const mnemonicResult = normalizedMnemonic
          ? NonEmptyString255Schema.safeParse(normalizedMnemonic)
          : null

        if (enabled && !mnemonicResult) {
          setError("settings.sparkAccount.mnemonic.required")
          return
        }

        if (mnemonicResult?.success === false) {
          setError("settings.sparkAccount.mnemonic.invalid")
          return
        }

        void submit(async () => {
          await using run = appRun()

          await run(
            saveSparkAccount({
              enabled,
              mnemonic: mnemonicResult?.data,
            })
          )

          if (mnemonicResult) {
            try {
              await using wallet = await createDefaultSparkPaymentWallet(
                mnemonicResult.data
              )
              const settings = await wallet.setPrivacyEnabled(privacyMode)

              if (!settings) {
                setPrivacyModeError(
                  "settings.sparkAccount.privacyMode.saveError"
                )
                return false
              }

              setPrivacyMode(settings.privateEnabled)
            } catch {
              setPrivacyModeError("settings.sparkAccount.privacyMode.saveError")
              return false
            }
          }

          setMnemonic(normalizedMnemonic)
          return undefined
        })
      }}
    >
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id={enabledInputId}
            checked={enabled}
            disabled={pending}
            onCheckedChange={setEnabled}
          />
          <FieldContent>
            <FieldLabel htmlFor={enabledInputId}>
              {t("settings.sparkAccount.enabled.label")}
            </FieldLabel>
            <FieldDescription>
              {t("settings.sparkAccount.enabled.description")}
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor={mnemonicInputId}>
            {t("settings.sparkAccount.mnemonic.label")}
          </FieldLabel>
          <PasswordTextarea
            id={mnemonicInputId}
            value={mnemonic}
            hideLabel={t("passwordTextarea.hide")}
            showLabel={t("passwordTextarea.show")}
            disabled={pending}
            aria-invalid={error !== null}
            autoComplete="off"
            placeholder={t("settings.sparkAccount.mnemonic.placeholder")}
            onChange={(event) => {
              setMnemonic(event.currentTarget.value)
              setError(null)
              setPrivacyModeError(null)
              resetSaved()
            }}
          />
          <FieldDescription>
            {t("settings.sparkAccount.mnemonic.description")}
          </FieldDescription>
          <FieldError>{error ? t(error) : null}</FieldError>
        </Field>

        <Field
          orientation="horizontal"
          data-invalid={privacyModeError !== null}
        >
          <Checkbox
            id={privacyModeInputId}
            checked={privacyMode}
            disabled={pending || privacyModePending}
            aria-invalid={privacyModeError !== null}
            onCheckedChange={(checked) => {
              setPrivacyMode(checked)
              setPrivacyModeError(null)
              resetSaved()
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={privacyModeInputId}>
              {t("settings.sparkAccount.privacyMode.label")}
            </FieldLabel>
            <FieldDescription>
              {privacyModePending
                ? t("settings.sparkAccount.privacyMode.loading")
                : t("settings.sparkAccount.privacyMode.description")}
            </FieldDescription>
            <FieldError>
              {privacyModeError ? t(privacyModeError) : null}
            </FieldError>
          </FieldContent>
        </Field>
      </FieldGroup>
    </SettingsFormCard>
  )
}

function CashRegisterAccountForm() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const enabledInputId = useId()
  const { data: accountData } = useEvoluQuery(cashRegisterAccountQuery)
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [account] = accountData
  const [settings] = settingsData
  const [enabled, setEnabled] = useState(false)
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  useEffect(() => {
    setEnabled(account ? account.isDeleted !== 1 : false)
  }, [account])

  return (
    <SettingsFormCard
      title={t("settings.cashRegisterAccount.form.title")}
      description={t("settings.cashRegisterAccount.form.description")}
      savedMessage={saved ? t("settings.cashRegisterAccount.saved") : null}
      submitLabel={t("settings.cashRegisterAccount.save")}
      pending={pending}
      onSubmit={(event) => {
        event.preventDefault()
        resetSaved()

        void submit(async () => {
          await using run = appRun()

          await run(
            saveCashRegisterAccount({
              enabled,
              currency: settings?.fiatCurrency ?? FiatCurrency.CZK,
            })
          )
        })
      }}
    >
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id={enabledInputId}
            checked={enabled}
            disabled={pending}
            onCheckedChange={(checked) => {
              setEnabled(checked)
              resetSaved()
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={enabledInputId}>
              {t("settings.cashRegisterAccount.enabled.label")}
            </FieldLabel>
            <FieldDescription>
              {t("settings.cashRegisterAccount.enabled.description")}
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </SettingsFormCard>
  )
}
