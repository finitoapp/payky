import { createRun } from "@evolu/web"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
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
import {
  cashRegisterAccountId,
  fiatBankAccountId,
  sparkAccountId,
} from "@/core/modules/account/account-utils.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { setDefaultPaymentAccount } from "@/core/modules/default-payment-account/default-payment-account-actions.ts"
import { defaultPaymentAccountByIdQuery } from "@/core/modules/default-payment-account/default-payment-account-queries.ts"
import {
  FiatCurrency,
  IbanSchema,
  NonEmptyString255Schema,
} from "@/core/modules/shared/schema.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/payment-accounts")({
  component: PaymentAccountsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

const normalizeIban = (value: string) =>
  value.replaceAll(/\s/gu, "").toUpperCase()

const normalizeMnemonic = (value: string) =>
  value.trim().replaceAll(/\s+/gu, " ")

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
  const { t } = useTranslation()
  const evolu = useEvolu()
  const ibanInputId = useId()
  const enabledInputId = useId()
  const defaultInputId = useId()
  const { data: accountData } = useEvoluQuery(fiatBankAccountQuery)
  const { data: defaultAccountData } = useEvoluQuery(
    defaultPaymentAccountByIdQuery(fiatBankAccountId)
  )
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [account] = accountData
  const [defaultAccount] = defaultAccountData
  const [settings] = settingsData
  const [enabled, setEnabled] = useState(false)
  const [defaultEnabled, setDefaultEnabled] = useState(false)
  const [iban, setIban] = useState("")
  const [error, setError] = useState<TranslationKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setEnabled(account ? account.isDeleted !== 1 : false)
    setIban(account?.iban ?? "")
  }, [account])

  useEffect(() => {
    setDefaultEnabled(defaultAccount ? defaultAccount.isDeleted !== 1 : false)
  }, [defaultAccount])

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setError(null)
        setSaved(false)

        const normalizedIban = normalizeIban(iban)
        const ibanResult = normalizedIban
          ? IbanSchema.safeParse(normalizedIban)
          : null

        if (enabled && !ibanResult) {
          setError("settings.fiatBankAccount.iban.required")
          return
        }

        if (ibanResult?.success === false) {
          setError("settings.fiatBankAccount.iban.invalid")
          return
        }

        setPending(true)
        try {
          await using run = createRun({
            evolu,
            evoluOwnerId: evolu.appOwner.id,
          })

          await run(
            saveFiatBankAccount({
              enabled,
              iban: ibanResult?.data,
              currency: settings?.fiatCurrency ?? FiatCurrency.CZK,
            })
          )
          await run(
            setDefaultPaymentAccount({
              accountId: fiatBankAccountId,
              enabled: enabled && defaultEnabled,
            })
          )

          setIban(normalizedIban)
          setSaved(true)
        } finally {
          setPending(false)
        }
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.fiatBankAccount.form.title")}</CardTitle>
          <CardDescription>
            {t("settings.fiatBankAccount.form.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
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

            <Field orientation="horizontal">
              <Checkbox
                id={defaultInputId}
                checked={enabled && defaultEnabled}
                disabled={pending || !enabled}
                onCheckedChange={(checked) => {
                  setDefaultEnabled(checked)
                  setSaved(false)
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor={defaultInputId}>
                  {t("settings.paymentAccounts.default.label")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.paymentAccounts.default.description")}
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
                  setSaved(false)
                }}
              />
              <FieldDescription>
                {t("settings.fiatBankAccount.iban.description")}
              </FieldDescription>
              <FieldError>{error ? t(error) : null}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {saved ? t("settings.fiatBankAccount.saved") : null}
          </p>
          <Button type="submit" disabled={pending}>
            {t("settings.fiatBankAccount.save")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

function SparkAccountForm() {
  const { t } = useTranslation()
  const evolu = useEvolu()
  const enabledInputId = useId()
  const defaultInputId = useId()
  const mnemonicInputId = useId()
  const { data: accountData } = useEvoluQuery(sparkAccountQuery)
  const { data: defaultAccountData } = useEvoluQuery(
    defaultPaymentAccountByIdQuery(sparkAccountId)
  )
  const [account] = accountData
  const [defaultAccount] = defaultAccountData
  const [enabled, setEnabled] = useState(false)
  const [defaultEnabled, setDefaultEnabled] = useState(false)
  const [mnemonic, setMnemonic] = useState("")
  const [error, setError] = useState<TranslationKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setEnabled(account ? account.isDeleted !== 1 : false)
    setMnemonic(account?.mnemonic ?? "")
  }, [account])

  useEffect(() => {
    setDefaultEnabled(defaultAccount ? defaultAccount.isDeleted !== 1 : false)
  }, [defaultAccount])

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setError(null)
        setSaved(false)

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

        setPending(true)
        try {
          await using run = createRun({
            evolu,
            evoluOwnerId: evolu.appOwner.id,
          })

          await run(
            saveSparkAccount({
              enabled,
              mnemonic: mnemonicResult?.data,
            })
          )
          await run(
            setDefaultPaymentAccount({
              accountId: sparkAccountId,
              enabled: enabled && defaultEnabled,
            })
          )

          setMnemonic(normalizedMnemonic)
          setSaved(true)
        } finally {
          setPending(false)
        }
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sparkAccount.form.title")}</CardTitle>
          <CardDescription>
            {t("settings.sparkAccount.form.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
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

            <Field orientation="horizontal">
              <Checkbox
                id={defaultInputId}
                checked={enabled && defaultEnabled}
                disabled={pending || !enabled}
                onCheckedChange={(checked) => {
                  setDefaultEnabled(checked)
                  setSaved(false)
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor={defaultInputId}>
                  {t("settings.paymentAccounts.default.label")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.paymentAccounts.default.description")}
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
                disabled={pending}
                aria-invalid={error !== null}
                autoComplete="off"
                placeholder={t("settings.sparkAccount.mnemonic.placeholder")}
                onChange={(event) => {
                  setMnemonic(event.currentTarget.value)
                  setError(null)
                  setSaved(false)
                }}
              />
              <FieldDescription>
                {t("settings.sparkAccount.mnemonic.description")}
              </FieldDescription>
              <FieldError>{error ? t(error) : null}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {saved ? t("settings.sparkAccount.saved") : null}
          </p>
          <Button type="submit" disabled={pending}>
            {t("settings.sparkAccount.save")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

function CashRegisterAccountForm() {
  const { t } = useTranslation()
  const evolu = useEvolu()
  const enabledInputId = useId()
  const defaultInputId = useId()
  const { data: accountData } = useEvoluQuery(cashRegisterAccountQuery)
  const { data: defaultAccountData } = useEvoluQuery(
    defaultPaymentAccountByIdQuery(cashRegisterAccountId)
  )
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [account] = accountData
  const [defaultAccount] = defaultAccountData
  const [settings] = settingsData
  const [enabled, setEnabled] = useState(false)
  const [defaultEnabled, setDefaultEnabled] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setEnabled(account ? account.isDeleted !== 1 : false)
  }, [account])

  useEffect(() => {
    setDefaultEnabled(defaultAccount ? defaultAccount.isDeleted !== 1 : false)
  }, [defaultAccount])

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setSaved(false)
        setPending(true)
        try {
          await using run = createRun({
            evolu,
            evoluOwnerId: evolu.appOwner.id,
          })

          await run(
            saveCashRegisterAccount({
              enabled,
              currency: settings?.fiatCurrency ?? FiatCurrency.CZK,
            })
          )
          await run(
            setDefaultPaymentAccount({
              accountId: cashRegisterAccountId,
              enabled: enabled && defaultEnabled,
            })
          )

          setSaved(true)
        } finally {
          setPending(false)
        }
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.cashRegisterAccount.form.title")}</CardTitle>
          <CardDescription>
            {t("settings.cashRegisterAccount.form.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Checkbox
                id={enabledInputId}
                checked={enabled}
                disabled={pending}
                onCheckedChange={(checked) => {
                  setEnabled(checked)
                  setSaved(false)
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
            <Field orientation="horizontal">
              <Checkbox
                id={defaultInputId}
                checked={enabled && defaultEnabled}
                disabled={pending || !enabled}
                onCheckedChange={(checked) => {
                  setDefaultEnabled(checked)
                  setSaved(false)
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor={defaultInputId}>
                  {t("settings.paymentAccounts.default.label")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.paymentAccounts.default.description")}
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {saved ? t("settings.cashRegisterAccount.saved") : null}
          </p>
          <Button type="submit" disabled={pending}>
            {t("settings.cashRegisterAccount.save")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
