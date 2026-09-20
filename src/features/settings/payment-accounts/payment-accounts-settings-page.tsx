import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { Banknote, Landmark, type LucideIcon, Zap } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useId, useState } from "react"
import { toast } from "sonner"

import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Switch } from "@/components/ui/switch.tsx"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx"
import {
  saveCashRegisterAccount,
  saveCashuAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import {
  cashRegisterAccountQuery,
  cashuAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { defaultCashuMintUrl } from "@/core/modules/account/account-utils.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  getBankAccountDefaults,
  getBankNameForIban,
} from "@/core/modules/shared/bank-codes.ts"
import {
  deriveDefaultSparkWalletSecret,
  SparkMnemonicSchema,
  type SparkSecret,
  sparkMnemonicToSecret,
  sparkSecretToMnemonic,
} from "@/core/modules/shared/key-derivation.ts"
import {
  BankAccountInputIbanSchema,
  CashuMintUrlSchema,
  FiatCurrency,
} from "@/core/modules/shared/schema.ts"
import { createDefaultSparkPaymentWallet } from "@/core/spark/spark-wallet.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useCashuWallet } from "@/hooks/use-cashu-wallet.ts"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatSatsAmount } from "@/lib/format-utils.ts"

/** How long an input rests before its valid value is written. */
const AUTOSAVE_DELAY_MS = 700

/**
 * One card per way the terminal takes money, each with the switch that
 * turns it on; nothing needs saving by hand — a switch writes at once and a
 * field writes once it holds a valid value. Bank transfers need only the
 * account: currency and QR standard follow from it. Bitcoin runs on one
 * backend at a time, cashu or Spark, chosen by the segmented control.
 */
export function PaymentAccountsSettingsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.paymentAccounts.title")} />
      <div className="flex flex-col gap-5">
        <BankTransferMethodCard />
        <BitcoinMethodCard />
        <CashMethodCard />
      </div>
    </>
  )
}

function MethodCard({
  icon: Icon,
  title,
  switchLabel,
  enabled,
  pending,
  onEnabledChange,
  children,
}: {
  readonly icon: LucideIcon
  readonly title: string
  readonly switchLabel: string
  readonly enabled: boolean
  readonly pending: boolean
  readonly onEnabledChange: (enabled: boolean) => void
  readonly children?: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <Icon className="text-muted-foreground" />
        <span className="flex-1 font-semibold">{title}</span>
        <Switch
          checked={enabled}
          disabled={pending}
          aria-label={switchLabel}
          onCheckedChange={onEnabledChange}
        />
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  )
}

const useSaveFailedToast = () => {
  const { t } = useTranslation()
  return useCallback(() => {
    toast.error(t("settings.saveFailed"))
  }, [t])
}

/** The "saved" line under a field, shown for a moment after each write. */
function SavedNotice({ visible, label }: { visible: boolean; label: string }) {
  return (
    <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
      {visible ? label : null}
    </p>
  )
}

const useSavedFlash = () => {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!visible) return
    const timeout = setTimeout(() => setVisible(false), 2_500)
    return () => clearTimeout(timeout)
  }, [visible])
  const flash = useCallback(() => setVisible(true), [])
  return { visible, flash }
}

function BankTransferMethodCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const formId = useId()
  const saveFailed = useSaveFailedToast()
  const saved = useSavedFlash()
  const { data: accountData } = useEvoluQuery(fiatBankAccountQuery)
  const [account] = accountData
  const accountEnabled = account !== undefined && account.isDeleted !== 1
  const [editing, setEditing] = useState(false)
  const [iban, setIban] = useState("")
  const [pending, setPending] = useState(false)
  const storedIban = account?.iban ?? ""

  useEffect(() => {
    setIban(storedIban)
  }, [storedIban])

  const parsed =
    iban.trim() === "" ? null : BankAccountInputIbanSchema.safeParse(iban)
  const parsedIban = parsed?.success ? parsed.data : null
  const invalid = parsed !== null && !parsed.success
  const derived =
    parsedIban === null ? null : getBankAccountDefaults(parsedIban)
  const bank = parsedIban === null ? null : getBankNameForIban(parsedIban)
  const formatLabel = {
    spayd: "settings.fiatBankAccount.qrFormat.spayd",
    payBySquare1_0_0: "settings.fiatBankAccount.qrFormat.payBySquare1_0_0",
    payBySquare1_2_0: "settings.fiatBankAccount.qrFormat.payBySquare1_2_0",
  } satisfies Record<
    ReturnType<typeof getBankAccountDefaults>["defaultQrFormat"],
    TranslationKey
  >

  // A valid account that differs from the stored one is written once the
  // typing pauses; the account is also what turns the method on.
  const debouncedIban = useDebouncedValue(parsedIban, AUTOSAVE_DELAY_MS)
  useEffect(() => {
    if (debouncedIban === null || debouncedIban !== parsedIban) return
    // Only while the field is shown, and only for an account that is new or
    // brings a switched-off method back — a stored account that the switch
    // just turned off must not switch itself on again.
    if (!editing && !accountEnabled) return
    if (debouncedIban === storedIban && accountEnabled) return
    const defaults = getBankAccountDefaults(debouncedIban)
    let active = true
    setPending(true)
    void (async () => {
      try {
        await using run = appRun()
        await run(
          saveFiatBankAccount({
            enabled: true,
            iban: debouncedIban,
            currency: defaults.currency,
            defaultQrFormat: defaults.defaultQrFormat,
          })
        )
        if (active) {
          setEditing(false)
          saved.flash()
        }
      } catch {
        if (active) saveFailed()
      } finally {
        if (active) setPending(false)
      }
    })()
    return () => {
      active = false
    }
  }, [
    debouncedIban,
    parsedIban,
    storedIban,
    accountEnabled,
    editing,
    appRun,
    saved.flash,
    saveFailed,
  ])

  const setEnabled = async (enabled: boolean) => {
    // Turning on without a saved account opens the field; entering the
    // account is what enables the method.
    if (enabled && account?.iban === undefined) {
      setEditing(true)
      return
    }
    if (account === undefined) return
    setPending(true)
    try {
      await using run = appRun()
      await run(
        saveFiatBankAccount({
          enabled,
          currency: account.currency,
          defaultQrFormat: account.defaultQrFormat ?? "spayd",
        })
      )
      if (!enabled) setEditing(false)
    } catch {
      saveFailed()
    } finally {
      setPending(false)
    }
  }

  return (
    <MethodCard
      icon={Landmark}
      title={t("settings.paymentMethods.bank.title")}
      switchLabel={t("settings.paymentMethods.bank.enabled")}
      enabled={accountEnabled || editing}
      pending={pending}
      onEnabledChange={(enabled) => void setEnabled(enabled)}
    >
      {accountEnabled || editing ? (
        <FieldGroup>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={`${formId}-account`}>
              {t("settings.paymentMethods.bank.account.label")}
            </FieldLabel>
            <Input
              id={`${formId}-account`}
              value={iban}
              aria-invalid={invalid}
              autoComplete="off"
              inputMode="text"
              onChange={(event) => {
                setIban(event.currentTarget.value)
              }}
            />
            <FieldDescription>
              {derived === null
                ? t("settings.paymentMethods.bank.account.description")
                : t(
                    bank === null
                      ? "settings.paymentMethods.bank.derivedUnknownBank"
                      : "settings.paymentMethods.bank.derived",
                    {
                      bank: bank ?? "",
                      currency: derived.currency,
                      format: t(formatLabel[derived.defaultQrFormat]),
                    }
                  )}
            </FieldDescription>
            <FieldError>
              {invalid ? t("settings.fiatBankAccount.iban.invalid") : null}
            </FieldError>
          </Field>
          <SavedNotice
            visible={saved.visible}
            label={t("settings.paymentMethods.bank.saved")}
          />
        </FieldGroup>
      ) : null}
    </MethodCard>
  )
}

type BitcoinBackend = "cashu" | "spark"

function BitcoinMethodCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const saveFailed = useSaveFailedToast()
  const { data: cashuData } = useEvoluQuery(cashuAccountQuery)
  const { data: sparkData } = useEvoluQuery(sparkAccountQuery)
  const [cashuAccount] = cashuData
  const [sparkAccount] = sparkData
  const cashuEnabled =
    cashuAccount !== undefined && cashuAccount.isDeleted !== 1
  const sparkEnabled =
    sparkAccount !== undefined && sparkAccount.isDeleted !== 1
  const bitcoinEnabled = cashuEnabled || sparkEnabled
  // The stored accounts decide which backend is on; Spark wins if an older
  // setup left both enabled, and the next switch turns the other off.
  const backend: BitcoinBackend = sparkEnabled ? "spark" : "cashu"
  const [pending, setPending] = useState(false)

  const applyBackend = async (
    next: BitcoinBackend | null,
    options: { readonly mintUrl?: string } = {}
  ) => {
    setPending(true)
    try {
      await using run = appRun()
      // Both accounts are written on every change: the one chosen comes on
      // and the other goes off, so the stored state never has both enabled
      // and the displayed backend follows the tab the user picked.
      if (next === "cashu" || cashuEnabled) {
        await run(
          saveCashuAccount({
            enabled: next === "cashu",
            mintUrl:
              CashuMintUrlSchema.safeParse(
                options.mintUrl ?? cashuAccount?.mintUrl ?? defaultCashuMintUrl
              ).data ?? defaultCashuMintUrl,
          })
        )
      }
      if (next === "spark" || sparkEnabled) {
        await run.ok(saveSparkAccount({ enabled: next === "spark" }))
      }
    } catch {
      saveFailed()
    } finally {
      setPending(false)
    }
  }

  return (
    <MethodCard
      icon={Zap}
      title={t("settings.paymentMethods.bitcoin.title")}
      switchLabel={t("settings.paymentMethods.bitcoin.enabled")}
      enabled={bitcoinEnabled}
      pending={pending}
      onEnabledChange={(enabled) => void applyBackend(enabled ? "cashu" : null)}
    >
      {bitcoinEnabled ? (
        <div className="flex flex-col gap-5">
          <Tabs
            value={backend}
            onValueChange={(value) => {
              if (
                (value === "cashu" || value === "spark") &&
                value !== backend
              ) {
                void applyBackend(value)
              }
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="cashu" className="flex-1" disabled={pending}>
                {t("settings.paymentMethods.bitcoin.cashu")}
              </TabsTrigger>
              <TabsTrigger value="spark" className="flex-1" disabled={pending}>
                {t("settings.paymentMethods.bitcoin.spark")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {backend === "cashu" ? (
            <CashuBackend
              mintUrl={cashuAccount?.mintUrl ?? null}
              pending={pending}
            />
          ) : (
            <SparkBackend
              secret={sparkAccount?.secret ?? null}
              pending={pending}
            />
          )}
        </div>
      ) : null}
    </MethodCard>
  )
}

function Balance({
  balance,
}: {
  readonly balance: {
    readonly isError: boolean
    readonly data: number | undefined
  }
}) {
  const { t } = useTranslation()
  const locale = useLocale()

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/60 px-4 py-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("settings.paymentMethods.balance")}
      </span>
      <span
        className="text-3xl font-semibold tabular-nums leading-tight"
        aria-live="polite"
      >
        {balance.isError
          ? t("settings.cashuAccount.balance.error")
          : balance.data === undefined
            ? "…"
            : t("settings.paymentMethods.balanceSats", {
                amount: formatSatsAmount(balance.data, locale),
              })}
      </span>
    </div>
  )
}

const cashuBalanceQueryKey = ["cashu", "balance"] as const

function CashuBackend({
  mintUrl: storedMintUrl,
  pending: parentPending,
}: {
  readonly mintUrl: string | null
  readonly pending: boolean
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const locale = useLocale()
  const formId = useId()
  const queryClient = useQueryClient()
  const cashuWallet = useCashuWallet()
  const saveFailed = useSaveFailedToast()
  const saved = useSavedFlash()
  const [mintUrl, setMintUrl] = useState<string>(defaultCashuMintUrl)
  const [restorePending, setRestorePending] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setMintUrl(storedMintUrl ?? defaultCashuMintUrl)
  }, [storedMintUrl])

  const parsedMint = CashuMintUrlSchema.safeParse(mintUrl)
  const parsedMintUrl = parsedMint.success ? parsedMint.data : null
  const invalid = mintUrl.trim() !== "" && !parsedMint.success
  const debouncedMintUrl = useDebouncedValue(parsedMintUrl, AUTOSAVE_DELAY_MS)
  useEffect(() => {
    if (debouncedMintUrl === null || debouncedMintUrl !== parsedMintUrl) return
    if (debouncedMintUrl === storedMintUrl) return
    let active = true
    setPending(true)
    void (async () => {
      try {
        await using run = appRun()
        await run(
          saveCashuAccount({ enabled: true, mintUrl: debouncedMintUrl })
        )
        if (active) saved.flash()
      } catch {
        if (active) saveFailed()
      } finally {
        if (active) setPending(false)
      }
    })()
    return () => {
      active = false
    }
  }, [
    debouncedMintUrl,
    parsedMintUrl,
    storedMintUrl,
    appRun,
    saved.flash,
    saveFailed,
  ])

  const balance = useQuery({
    queryKey: [...cashuBalanceQueryKey, storedMintUrl],
    queryFn: async () => (await cashuWallet.getBalances()).totalSats,
  })

  useEffect(
    () =>
      cashuWallet.subscribeInventory(() => {
        void queryClient.invalidateQueries({ queryKey: cashuBalanceQueryKey })
      }),
    [cashuWallet, queryClient]
  )

  const restoreFromMint = async () => {
    if (storedMintUrl === null) return
    setRestorePending(true)
    try {
      const report = await cashuWallet.restore({ mintUrls: [storedMintUrl] })
      await queryClient.invalidateQueries({ queryKey: cashuBalanceQueryKey })
      if (report.unavailableMints.length > 0) {
        toast.error(t("settings.cashuAccount.restore.unavailable"))
        return
      }
      toast.success(
        t("settings.cashuAccount.restore.success", {
          amount: formatSatsAmount(report.restoredSats, locale),
          count: report.restoredProofs,
        })
      )
    } catch {
      toast.error(t("settings.cashuAccount.restore.error"))
    } finally {
      setRestorePending(false)
    }
  }

  const busy = pending || parentPending

  return (
    <div className="flex flex-col gap-4">
      <Balance balance={balance} />
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={`${formId}-mintUrl`}>
          {t("settings.cashuAccount.mintUrl.label")}
        </FieldLabel>
        <Input
          id={`${formId}-mintUrl`}
          value={mintUrl}
          aria-invalid={invalid}
          autoComplete="off"
          inputMode="url"
          onChange={(event) => {
            setMintUrl(event.currentTarget.value)
          }}
        />
        <FieldDescription>
          {t("settings.cashuAccount.mintUrl.description")}
        </FieldDescription>
        <FieldError>
          {invalid ? t("settings.cashuAccount.mintUrl.invalid") : null}
        </FieldError>
      </Field>
      <div className="flex items-center justify-between gap-3">
        <SavedNotice
          visible={saved.visible}
          label={t("settings.cashuAccount.saved")}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || restorePending}
          onClick={() => void restoreFromMint()}
        >
          {restorePending
            ? t("settings.cashuAccount.restore.pending")
            : t("settings.cashuAccount.restore.action")}
        </Button>
      </div>
    </div>
  )
}

function SparkBackend({
  secret,
  pending: parentPending,
}: {
  readonly secret: SparkSecret | null
  readonly pending: boolean
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const formId = useId()
  const { masterKey } = useAtomValue(accountAtom)
  const saveFailed = useSaveFailedToast()
  const saved = useSavedFlash()
  const [mnemonic, setMnemonic] = useState("")
  const [pending, setPending] = useState(false)
  // Until a wallet is stored, the words are the ones the recovery phrase
  // derives; pasting another wallet's words replaces them once they rest.
  const storedMnemonic = sparkSecretToMnemonic(
    secret ?? deriveDefaultSparkWalletSecret(masterKey)
  )

  useEffect(() => {
    setMnemonic(storedMnemonic)
  }, [storedMnemonic])

  const normalized = mnemonic.replaceAll(/\s+/gu, " ").trim()
  const parsedMnemonic =
    normalized === "" || normalized === storedMnemonic
      ? null
      : SparkMnemonicSchema.safeParse(normalized)
  const invalid = parsedMnemonic?.success === false
  const importedMnemonic = parsedMnemonic?.success ? parsedMnemonic.data : null
  const debouncedMnemonic = useDebouncedValue(
    importedMnemonic,
    AUTOSAVE_DELAY_MS
  )
  useEffect(() => {
    if (debouncedMnemonic === null || debouncedMnemonic !== importedMnemonic)
      return
    let active = true
    setPending(true)
    void (async () => {
      try {
        await using run = appRun()
        await run.ok(
          saveSparkAccount({
            enabled: true,
            secret: sparkMnemonicToSecret(debouncedMnemonic),
          })
        )
        if (active) saved.flash()
      } catch {
        if (active) saveFailed()
      } finally {
        if (active) setPending(false)
      }
    })()
    return () => {
      active = false
    }
  }, [debouncedMnemonic, importedMnemonic, appRun, saved.flash, saveFailed])

  const balance = useQuery({
    queryKey: ["spark", "balance", secret],
    queryFn: async () => {
      if (secret === null) throw new Error("No Spark account secret.")
      await using wallet = await createDefaultSparkPaymentWallet(secret)
      return (await wallet.getBalance()).availableSats
    },
    enabled: secret !== null,
  })

  const busy = pending || parentPending

  return (
    <div className="flex flex-col gap-4">
      <Balance balance={balance} />
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={`${formId}-mnemonic`}>
          {t("settings.sparkAccount.mnemonic.label")}
        </FieldLabel>
        <PasswordTextarea
          id={`${formId}-mnemonic`}
          value={mnemonic}
          hideLabel={t("passwordTextarea.hide")}
          showLabel={t("passwordTextarea.show")}
          disabled={busy}
          aria-invalid={invalid}
          autoComplete="off"
          onChange={(event) => {
            setMnemonic(event.currentTarget.value)
          }}
        />
        <FieldDescription>
          {t("settings.sparkAccount.mnemonic.description")}
        </FieldDescription>
        <FieldError>
          {invalid ? t("settings.sparkAccount.mnemonic.invalid") : null}
        </FieldError>
      </Field>
      <SavedNotice
        visible={saved.visible}
        label={t("settings.sparkAccount.saved")}
      />
    </div>
  )
}

function CashMethodCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const saveFailed = useSaveFailedToast()
  const { data: accountData } = useEvoluQuery(cashRegisterAccountQuery)
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [account] = accountData
  const [settings] = settingsData
  const [pending, setPending] = useState(false)
  const enabled = account !== undefined && account.isDeleted !== 1

  const setEnabled = async (nextEnabled: boolean) => {
    setPending(true)
    try {
      await using run = appRun()
      await run(
        saveCashRegisterAccount({
          enabled: nextEnabled,
          currency: settings?.fiatCurrency ?? FiatCurrency.CZK,
        })
      )
    } catch {
      saveFailed()
    } finally {
      setPending(false)
    }
  }

  return (
    <MethodCard
      icon={Banknote}
      title={t("settings.paymentMethods.cash.title")}
      switchLabel={t("settings.paymentMethods.cash.enabled")}
      enabled={enabled}
      pending={pending}
      onEnabledChange={(nextEnabled) => void setEnabled(nextEnabled)}
    />
  )
}
