import { useAtomValue } from "jotai"
import { ChevronDown, KeyRound, type LucideIcon, Wallet } from "lucide-react"
import { Suspense, useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { OptionToggleGroup } from "@/components/option-toggle-group.tsx"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardAction,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import {
  type DefaultPaymentMethodCannotBeDisabledError,
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
  selectCustomSparkWallet,
  selectDefaultSparkWallet,
  updateSparkAccountSyncPointer,
} from "@/core/modules/account/account-actions.ts"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { sparkAccountSyncPointerByAccountIdQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { normalizeMnemonic } from "@/core/modules/account/account-utils.ts"
import {
  type DefaultPaymentMethodDisabledError,
  setDefaultPaymentMethod,
} from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import { bankQrFormats } from "@/core/modules/payment/payment-iban-qr-payload-utils.ts"
import { isValidIban } from "@/core/modules/shared/iban-utils.ts"
import {
  deriveDefaultSparkWalletSecret,
  SparkMnemonicSchema,
  type SparkSecret,
  sparkMnemonicToSecret,
  sparkSecretToMnemonic,
} from "@/core/modules/shared/key-derivation.ts"
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
import { InlineEditSwitch } from "@/features/settings/inline-edit-switch.tsx"
import { fiatCurrencyOptions } from "@/features/shared/fiat-currency-options.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
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
  const isDefault = settings?.defaultPaymentMethod === "iban"
  const isAvailable = enabled && account?.currency === settings?.fiatCurrency

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
    await run.orThrow(
      saveFiatBankAccount({
        enabled: changed.enabled ?? enabled,
        iban: changed.iban ?? iban ?? undefined,
        currency: changed.currency ?? currency,
        defaultQrFormat: changed.defaultQrFormat ?? defaultQrFormat,
      })
    )
  }

  const saveEnabled = async (nextEnabled: boolean) => {
    await using run = appRun()
    const result = await run(
      saveFiatBankAccount({
        enabled: nextEnabled,
        iban: iban ?? undefined,
        currency,
        defaultQrFormat,
      })
    )

    return result.ok
      ? undefined
      : defaultPaymentMethodDisableErrorKeys[result.error.type]
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("settings.fiatBankAccount.form.title")}
          <DefaultPaymentMethodBadge
            method="iban"
            enabled={isAvailable}
            isDefault={isDefault}
          />
        </CardTitle>
        <CardDescription>
          {t("settings.fiatBankAccount.form.description")}
        </CardDescription>
        <CardAction>
          <InlineEditSwitch
            label={t("settings.fiatBankAccount.enabled.label")}
            defaultValue={enabled}
            disabled={!hasIban}
            showText={false}
            showSaved={false}
            onSave={saveEnabled}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!enabled && hasIban} className="contents">
          <div className={!enabled && hasIban ? "opacity-50" : undefined}>
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
                        options={fiatBankAccountQrFormatOptions.map(
                          (option) => ({
                            value: option.value,
                            label: t(option.label),
                          })
                        )}
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
          </div>
        </fieldset>
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
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const [privacyMode, setPrivacyMode] = useState(false)
  const [privacyModeError, setPrivacyModeError] =
    useState<TranslationKey | null>(null)
  const [privacyModePending, setPrivacyModePending] = useState(false)

  const { masterKey } = useAtomValue(accountAtom)

  const enabled = account ? account.isDeleted !== 1 : false
  const secret = account?.secret ?? null
  const isDefault = settings?.defaultPaymentMethod === "spark"
  const isDefaultWallet =
    secret === null || secret === deriveDefaultSparkWalletSecret(masterKey)

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
        <CardTitle className="flex items-center gap-2">
          {t("settings.sparkAccount.form.title")}
          <DefaultPaymentMethodBadge
            method="spark"
            enabled={enabled}
            isDefault={isDefault}
          />
        </CardTitle>
        <CardDescription>
          {t(
            isDefaultWallet
              ? "settings.sparkAccount.form.description"
              : "settings.sparkAccount.form.customDescription"
          )}
        </CardDescription>
        <CardAction>
          <InlineEditSwitch
            label={t("settings.sparkAccount.enabled.label")}
            defaultValue={enabled}
            showText={false}
            showSaved={false}
            onSave={async (nextEnabled) => {
              await using run = appRun()
              const result = await run(
                saveSparkAccount({ enabled: nextEnabled })
              )

              return result.ok
                ? undefined
                : defaultPaymentMethodDisableErrorKeys[result.error.type]
            }}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!enabled} className="contents">
          <div className={!enabled ? "opacity-50" : undefined}>
            <FieldGroup>
              {secret !== null && (
                <SparkWalletSummary
                  secret={secret}
                  isDefaultWallet={isDefaultWallet}
                />
              )}

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

              <Collapsible>
                <CollapsibleTrigger className="group/advanced-options flex w-full items-center justify-between text-left text-sm font-medium">
                  {t("settings.sparkAccount.advanced")}
                  <ChevronDown
                    className="size-4 transition-transform group-data-[panel-open]/advanced-options:rotate-180"
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden h-(--collapsible-panel-height) transition-[height] duration-200 ease-out data-starting-style:h-0 data-ending-style:h-0">
                  <div className="min-h-0 pt-5">
                    <FieldGroup>
                      <InlineEditCheckbox
                        label={t("settings.sparkAccount.privacyMode.label")}
                        description={
                          privacyModeError
                            ? t(privacyModeError)
                            : privacyModePending
                              ? t("settings.sparkAccount.privacyMode.loading")
                              : t(
                                  "settings.sparkAccount.privacyMode.description"
                                )
                        }
                        defaultValue={privacyMode}
                        disabled={secret === null || privacyModePending}
                        onSave={async (nextPrivacyMode) => {
                          if (secret === null) return

                          await using wallet =
                            await createDefaultSparkPaymentWallet(secret)
                          const walletSettings =
                            await wallet.setPrivacyEnabled(nextPrivacyMode)

                          if (!walletSettings) {
                            throw new Error(
                              "Failed to save Spark privacy mode."
                            )
                          }

                          setPrivacyMode(walletSettings.privateEnabled)
                        }}
                      />

                      {account !== undefined && (
                        // The pointer query is keyed by the account id, so it
                        // first loads when this panel opens or the wallet
                        // changes. Suspending here keeps that to this field
                        // instead of blanking the whole page.
                        <Suspense fallback={null}>
                          <SparkSyncPointerField accountId={account.id} />
                        </Suspense>
                      )}
                    </FieldGroup>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </FieldGroup>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  )
}

type SparkWalletKind = "payky" | "custom"

const sparkWalletOptions = [
  {
    value: "payky",
    icon: KeyRound,
    title: "settings.sparkAccount.wallet.payky.title",
    description: "settings.sparkAccount.wallet.payky.description",
  },
  {
    value: "custom",
    icon: Wallet,
    title: "settings.sparkAccount.wallet.custom.title",
    description: "settings.sparkAccount.wallet.custom.description",
  },
] as const satisfies ReadonlyArray<{
  readonly value: SparkWalletKind
  readonly icon: LucideIcon
  readonly title: TranslationKey
  readonly description: TranslationKey
}>

/**
 * Which wallet Spark payments go to, and the one way to change it: a dialog
 * covering every switch — to your own wallet, from one of your own to
 * another, and back to the Payky wallet.
 */
function SparkWalletSummary({
  secret,
  isDefaultWallet,
}: {
  readonly secret: SparkSecret
  readonly isDefaultWallet: boolean
}) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const current = isDefaultWallet
    ? sparkWalletOptions[0]
    : sparkWalletOptions[1]
  const CurrentIcon = current.icon

  return (
    <Field>
      <FieldLabel>{t("settings.sparkAccount.wallet.label")}</FieldLabel>
      <div className="flex items-center gap-4 rounded-lg border px-4 py-3">
        <CurrentIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{t(current.title)}</span>
          <span className="text-xs text-muted-foreground">
            {t(current.description)}
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          {t("settings.sparkAccount.wallet.change")}
        </Button>
      </div>
      <ChangeSparkWalletDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentSecret={secret}
        isDefaultWallet={isDefaultWallet}
      />
    </Field>
  )
}

function ChangeSparkWalletDialog({
  open,
  onOpenChange,
  currentSecret,
  isDefaultWallet,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly currentSecret: SparkSecret
  readonly isDefaultWallet: boolean
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const mnemonicId = useId()
  // Your own wallet is preselected: changing the wallet most often means
  // bringing a new mnemonic, including when one of your own is active.
  const [target, setTarget] = useState<SparkWalletKind>("custom")
  const [mnemonic, setMnemonic] = useState("")

  const normalized = normalizeMnemonic(mnemonic)
  const wordCount = normalized === "" ? 0 : normalized.split(" ").length
  const parsed = SparkMnemonicSchema.safeParse(normalized)
  const isCurrentMnemonic =
    parsed.success && sparkMnemonicToSecret(parsed.data) === currentSecret
  const mnemonicErrorKey: TranslationKey | null = isCurrentMnemonic
    ? "settings.sparkAccount.wallet.changeDialog.current"
    : !parsed.success && wordCount >= 12
      ? "settings.sparkAccount.wallet.changeDialog.invalid"
      : null
  const canSwitch =
    target === "payky" ? !isDefaultWallet : parsed.success && !isCurrentMnemonic

  const close = () => {
    setTarget("custom")
    setMnemonic("")
    onOpenChange(false)
  }

  const switchWallet = async () => {
    if (!canSwitch) return
    close()

    await runToast(async (run) => {
      if (target === "payky") {
        await run.ok(selectDefaultSparkWallet())
      } else if (parsed.success) {
        await run.ok(selectCustomSparkWallet({ mnemonic: parsed.data }))
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("settings.sparkAccount.wallet.changeDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.sparkAccount.wallet.changeDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void switchWallet()
          }}
        >
          <OptionToggleGroup<SparkWalletKind>
            value={target}
            options={sparkWalletOptions.map((option) => ({
              value: option.value,
              icon: option.icon,
              title: t(option.title),
              description:
                option.value === "payky" && isDefaultWallet
                  ? t("settings.sparkAccount.wallet.changeDialog.inUse")
                  : t(option.description),
            }))}
            onChange={setTarget}
          />
          {target === "custom" && (
            <Field data-invalid={mnemonicErrorKey !== null}>
              <FieldLabel htmlFor={mnemonicId}>
                {t("settings.sparkAccount.mnemonic.label")}
              </FieldLabel>
              <PasswordTextarea
                id={mnemonicId}
                value={mnemonic}
                hideLabel={t("passwordTextarea.hide")}
                showLabel={t("passwordTextarea.show")}
                aria-invalid={mnemonicErrorKey !== null}
                autoComplete="off"
                onChange={(event) => setMnemonic(event.currentTarget.value)}
              />
              <FieldDescription>
                {t("settings.sparkAccount.wallet.changeDialog.wordCount", {
                  value: wordCount,
                })}
              </FieldDescription>
              <FieldError>
                {mnemonicErrorKey === null ? null : t(mnemonicErrorKey)}
              </FieldError>
            </Field>
          )}
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("settings.sparkAccount.wallet.warning.invoices")}</li>
            <li>{t("settings.sparkAccount.wallet.warning.funds")}</li>
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("settings.sparkAccount.wallet.cancel")}
            </Button>
            <Button type="submit" disabled={!canSwitch}>
              {t("settings.sparkAccount.wallet.switch")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Its own component because the pointer is keyed by the Spark account's id,
 * which derives from the wallet secret and so only exists once the account
 * does.
 */
function SparkSyncPointerField({
  accountId,
}: {
  readonly accountId: AccountId
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data: pointers } = useEvoluQuery(
    sparkAccountSyncPointerByAccountIdQuery(accountId)
  )
  const [pointer] = pointers

  return (
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
            id: accountId,
            lastSyncedAt: nextLastSyncedAt,
          })
        )
      }}
    />
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
  const isDefault = settings?.defaultPaymentMethod === "cashRegister"
  const isAvailable = enabled && account?.currency === settings?.fiatCurrency

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("settings.cashRegisterAccount.form.title")}
          <DefaultPaymentMethodBadge
            method="cashRegister"
            enabled={isAvailable}
            isDefault={isDefault}
          />
        </CardTitle>
        <CardDescription>
          {t("settings.cashRegisterAccount.form.description")}
        </CardDescription>
        <CardAction>
          <InlineEditSwitch
            label={t("settings.cashRegisterAccount.enabled.label")}
            defaultValue={enabled}
            showText={false}
            showSaved={false}
            onSave={async (nextEnabled) => {
              await using run = appRun()
              const result = await run(
                saveCashRegisterAccount({
                  enabled: nextEnabled,
                  currency: settings?.fiatCurrency ?? FiatCurrency.CZK,
                })
              )

              return result.ok
                ? undefined
                : defaultPaymentMethodDisableErrorKeys[result.error.type]
            }}
          />
        </CardAction>
      </CardHeader>
    </Card>
  )
}

function DefaultPaymentMethodBadge({
  method,
  enabled,
  isDefault,
}: {
  readonly method: DefaultPaymentMethod
  readonly enabled: boolean
  readonly isDefault: boolean
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()

  if (isDefault) {
    return (
      <Badge variant="secondary">{t("settings.paymentAccounts.default")}</Badge>
    )
  }

  return (
    <button
      type="button"
      disabled={!enabled}
      aria-label={t("settings.paymentAccounts.default.set.aria", {
        name: t(defaultPaymentMethodTitleKeys[method]),
      })}
      className="rounded-4xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      onClick={async () => {
        try {
          await using run = appRun()
          const result = await run(setDefaultPaymentMethod(method))
          if (!result.ok) {
            toast.error(t(defaultPaymentMethodErrorKeys[result.error.type]))
          }
        } catch {
          toast.error(t("settings.saveFailed"))
        }
      }}
    >
      <Badge variant="outline">
        {t("settings.paymentAccounts.default.set")}
      </Badge>
    </button>
  )
}

const defaultPaymentMethodTitleKeys = {
  iban: "settings.paymentAccounts.method.iban",
  spark: "settings.paymentAccounts.method.spark",
  cashRegister: "settings.paymentAccounts.method.cashRegister",
} satisfies Record<DefaultPaymentMethod, TranslationKey>

const defaultPaymentMethodErrorKeys = {
  DefaultPaymentMethodDisabled: "settings.paymentAccounts.default.disabled",
} satisfies Record<DefaultPaymentMethodDisabledError["type"], TranslationKey>

const defaultPaymentMethodDisableErrorKeys = {
  DefaultPaymentMethodCannotBeDisabled:
    "settings.paymentAccounts.default.deactivate",
} satisfies Record<
  DefaultPaymentMethodCannotBeDisabledError["type"],
  TranslationKey
>
