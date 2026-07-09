import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ClipboardPasteIcon,
  CopyIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  ScanLineIcon,
} from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
import { PaymentSuccess } from "@/components/payment-success.tsx"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import {
  PositiveInteger,
  PositiveIntegerSchema,
} from "@/core/modules/shared/schema.ts"
import {
  executeWithdrawal,
  quoteWithdrawal,
  type WithdrawalQuote,
} from "@/core/modules/withdrawal/withdrawal-actions.ts"
import { isValidBitcoinAddress } from "@/core/modules/withdrawal/withdrawal-utils.ts"
import {
  createDefaultSparkPaymentWallet,
  type SparkExitSpeed,
} from "@/core/spark/spark-wallet.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { WithdrawQrScanner } from "./withdraw-qr-scanner.tsx"
import {
  formatAddressGroups,
  formatSatsAmount,
  type ScannedBitcoinAddress,
} from "./withdraw-utils.ts"

type WithdrawStep = "form" | "review" | "result"

const exitSpeedOptions: ReadonlyArray<{
  readonly value: SparkExitSpeed
  readonly label: TranslationKey
}> = [
  { value: "fast", label: "withdraw.review.speed.fast" },
  { value: "medium", label: "withdraw.review.speed.medium" },
  { value: "slow", label: "withdraw.review.speed.slow" },
]

const quoteErrorKey = (errorType: string): TranslationKey => {
  switch (errorType) {
    case "WithdrawalAccountNotFound":
      return "withdraw.error.accountNotFound"
    case "InvalidBitcoinAddress":
      return "withdraw.address.invalid"
    case "InsufficientWithdrawalBalance":
      return "withdraw.error.insufficientBalance"
    default:
      return "withdraw.quoteError.generic"
  }
}

interface ConfirmWithdrawalError {
  readonly type: string
  readonly message?: string
}

const confirmErrorKey = (error: ConfirmWithdrawalError): TranslationKey => {
  switch (error.type) {
    case "AbortError":
      return "withdraw.review.error.interrupted"
    case "WithdrawalAccountNotFound":
      return "withdraw.error.accountNotFound"
    case "WithdrawalFailed":
      return error.message === "Failed to record the withdrawal transaction"
        ? "withdraw.review.error.recordFailed"
        : "withdraw.review.error.sparkFailed"
    default:
      return "withdraw.review.error.sparkFailed"
  }
}

export function WithdrawPage() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: sparkAccountsData } = useEvoluQuery(activeSparkAccountsQuery)
  const [sparkAccount] = sparkAccountsData

  const [step, setStep] = useState<WithdrawStep>("form")
  const [address, setAddress] = useState("")
  const [addressError, setAddressError] = useState<TranslationKey | null>(null)
  const [amountInput, setAmountInput] = useState("")
  const [withdrawAll, setWithdrawAll] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [quotePending, setQuotePending] = useState(false)
  const [quoteError, setQuoteError] = useState<TranslationKey | null>(null)
  const [quote, setQuote] = useState<WithdrawalQuote | null>(null)
  const [exitSpeed, setExitSpeed] = useState<SparkExitSpeed>("medium")
  const [confirmPending, setConfirmPending] = useState(false)
  const [confirmError, setConfirmError] = useState<TranslationKey | null>(null)
  const [result, setResult] = useState<{
    readonly txid: string | null
    readonly status: string
  } | null>(null)
  const [availableSats, setAvailableSats] = useState<number | null>(null)

  useEffect(() => {
    const mnemonic = sparkAccount?.mnemonic
    let active = true

    setAvailableSats(null)
    if (!mnemonic) return

    const loadBalance = async () => {
      try {
        await using wallet = await createDefaultSparkPaymentWallet(mnemonic)
        const balance = await wallet.getBalance()
        if (active) setAvailableSats(balance.availableSats)
      } catch {
        if (active) setAvailableSats(null)
      }
    }

    void loadBalance()

    return () => {
      active = false
    }
  }, [sparkAccount?.mnemonic])

  if (!sparkAccount) {
    return (
      <>
        <div className="h-6" />
        <FadeHeader title={t("settings.withdrawals.title")} />
        <Card>
          <CardHeader>
            <CardTitle>{t("withdraw.noAccount.title")}</CardTitle>
            <CardDescription>
              {t("withdraw.noAccount.description")}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              className="w-fit"
              nativeButton={false}
              render={<Link to="/settings/payment-accounts" />}
            >
              {t("withdraw.noAccount.action")}
            </Button>
          </CardFooter>
        </Card>
      </>
    )
  }

  const applyScannedAddress = (scanned: ScannedBitcoinAddress) => {
    setAddress(scanned.address)
    setAddressError(null)
    if (scanned.amountSats !== undefined) {
      setWithdrawAll(false)
      setAmountInput(String(scanned.amountSats))
    }
    setScannerOpen(false)
  }

  const pasteAddress = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      setAddress(clipboardText.trim())
      setAddressError(null)
    } catch {
      toast.error(t("withdraw.address.pasteError"))
    }
  }

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAddressError(null)
    setQuoteError(null)

    const trimmedAddress = address.trim()
    if (!isValidBitcoinAddress(trimmedAddress)) {
      setAddressError("withdraw.address.invalid")
      return
    }

    const amountResult = withdrawAll
      ? null
      : PositiveIntegerSchema.safeParse(Math.trunc(Number(amountInput)))
    if (!withdrawAll && (!amountInput || !amountResult?.success)) {
      setQuoteError("withdraw.amount.invalid")
      return
    }

    setQuotePending(true)
    try {
      await using run = appRun()
      const quoteResult = await run(
        quoteWithdrawal({
          accountId: sparkAccount.id,
          onchainAddress: trimmedAddress,
          amountSats: amountResult?.success ? amountResult.data : undefined,
        })
      )

      if (!quoteResult.ok) {
        setQuoteError(quoteErrorKey(quoteResult.error.type))
        return
      }

      setAddress(trimmedAddress)
      setQuote(quoteResult.value)
      setStep("review")
    } finally {
      setQuotePending(false)
    }
  }

  const confirmWithdrawal = async () => {
    if (!quote) return

    setConfirmPending(true)
    setConfirmError(null)
    try {
      await using run = appRun()
      const executeResult = await run(
        executeWithdrawal({
          accountId: sparkAccount.id,
          onchainAddress: address,
          amountSats: PositiveInteger(quote.amountSats),
          withdrawAll: quote.withdrawAll,
          availableSats: quote.availableSats,
          exitSpeed,
          feeQuote: quote.feeQuote,
        })
      )

      if (!executeResult.ok) {
        setConfirmError(confirmErrorKey(executeResult.error))
        return
      }

      setResult({
        txid: executeResult.value.txid,
        status: executeResult.value.status,
      })
      setStep("result")
    } finally {
      setConfirmPending(false)
    }
  }

  const copyTxid = async () => {
    if (!result?.txid) return

    try {
      await navigator.clipboard.writeText(result.txid)
      toast.success(t("withdraw.result.copied"))
    } catch {
      toast.error(t("withdraw.result.copyError"))
    }
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.withdrawals.title")} />

      {step === "form" ? (
        <form onSubmit={(event) => void submitForm(event)}>
          <Card>
            <CardHeader>
              <CardTitle>{t("withdraw.form.title")}</CardTitle>
              <CardDescription>
                {t("withdraw.form.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="withdraw-address">
                    {t("withdraw.address.label")}
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="withdraw-address"
                      value={address}
                      placeholder={t("withdraw.address.placeholder")}
                      aria-invalid={addressError !== null}
                      onChange={(event) => {
                        setAddress(event.target.value)
                        setAddressError(null)
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("withdraw.address.paste")}
                      onClick={() => void pasteAddress()}
                    >
                      <ClipboardPasteIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("withdraw.address.scan")}
                      onClick={() => setScannerOpen(true)}
                    >
                      <ScanLineIcon />
                    </Button>
                  </div>
                  <FieldError>
                    {addressError ? t(addressError) : null}
                  </FieldError>
                </Field>

                <Field>
                  <FieldLabel htmlFor="withdraw-amount">
                    {t("withdraw.amount.label")}
                  </FieldLabel>
                  <Input
                    id="withdraw-amount"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    disabled={withdrawAll}
                    value={amountInput}
                    placeholder={t("withdraw.amount.placeholder")}
                    onChange={(event) => setAmountInput(event.target.value)}
                  />
                  {availableSats !== null ? (
                    <FieldDescription>
                      {t("withdraw.amount.available", {
                        amount: formatSatsAmount(availableSats, locale),
                      })}
                    </FieldDescription>
                  ) : null}
                </Field>

                <Field orientation="horizontal">
                  <Checkbox
                    id="withdraw-all"
                    checked={withdrawAll}
                    onCheckedChange={(checked) =>
                      setWithdrawAll(checked === true)
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="withdraw-all">
                      {t("withdraw.all.label")}
                    </FieldLabel>
                    <FieldDescription>
                      {t("withdraw.all.description")}
                    </FieldDescription>
                  </FieldContent>
                </Field>

                <FieldError>{quoteError ? t(quoteError) : null}</FieldError>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={quotePending}>
                {quotePending ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : null}
                {quotePending
                  ? t("withdraw.quotePending")
                  : t("withdraw.continue")}
              </Button>
            </CardFooter>
          </Card>
        </form>
      ) : null}

      {step === "review" && quote ? (
        <ReviewStep
          address={address}
          quote={quote}
          exitSpeed={exitSpeed}
          onExitSpeedChange={setExitSpeed}
          confirmPending={confirmPending}
          confirmError={confirmError}
          onBack={() => setStep("form")}
          onConfirm={() => void confirmWithdrawal()}
          locale={locale}
        />
      ) : null}

      {step === "result" && result ? (
        <PaymentSuccess
          title={t("withdraw.result.title")}
          description={t("withdraw.result.description")}
          actions={
            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-left text-sm">
                <span className="text-muted-foreground">
                  {t("withdraw.result.status")}
                </span>
                <span className="font-medium">{result.status}</span>
                {result.txid ? (
                  <>
                    <span className="mt-2 text-muted-foreground">
                      {t("withdraw.result.txid")}
                    </span>
                    <span className="break-all font-mono text-xs">
                      {result.txid}
                    </span>
                  </>
                ) : null}
              </div>
              {result.txid ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => void copyTxid()}
                  >
                    <CopyIcon />
                    {t("withdraw.result.copyTxid")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    nativeButton={false}
                    render={
                      <a
                        href={`https://mempool.space/tx/${result.txid}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <ExternalLinkIcon />
                    {t("withdraw.result.viewOnExplorer")}
                  </Button>
                </div>
              ) : null}
              <Button
                className="w-full"
                nativeButton={false}
                render={<Link to="/settings" />}
              >
                {t("withdraw.result.done")}
              </Button>
            </div>
          }
        />
      ) : null}

      {scannerOpen ? (
        <WithdrawQrScanner
          onScan={applyScannedAddress}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
    </>
  )
}

function ReviewStep({
  address,
  quote,
  exitSpeed,
  onExitSpeedChange,
  confirmPending,
  confirmError,
  onBack,
  onConfirm,
  locale,
}: {
  readonly address: string
  readonly quote: WithdrawalQuote
  readonly exitSpeed: SparkExitSpeed
  readonly onExitSpeedChange: (exitSpeed: SparkExitSpeed) => void
  readonly confirmPending: boolean
  readonly confirmError: TranslationKey | null
  readonly onBack: () => void
  readonly onConfirm: () => void
  readonly locale: string
}) {
  const { t } = useTranslation()
  const feeEstimate = quote.feeQuote[exitSpeed]
  const totalSats = quote.withdrawAll
    ? quote.availableSats
    : quote.amountSats + feeEstimate.totalFeeSats

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("withdraw.review.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <ToggleGroup<SparkExitSpeed>
            value={[exitSpeed]}
            onValueChange={(value) => {
              const [nextExitSpeed] = value
              if (nextExitSpeed) onExitSpeedChange(nextExitSpeed)
            }}
            variant="outline"
            spacing={0}
            className="grid w-full grid-cols-1"
            orientation="vertical"
          >
            {exitSpeedOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="w-full justify-between px-4"
              >
                <span>{t(option.label)}</span>
                <span className="text-xs text-muted-foreground">
                  {t("withdraw.sats", {
                    amount: formatSatsAmount(
                      quote.feeQuote[option.value].totalFeeSats,
                      locale
                    ),
                  })}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <dl className="flex flex-col gap-3 text-sm">
            <ReviewRow label={t("withdraw.review.destination")} stacked>
              <span className="break-all font-mono text-xs">
                {formatAddressGroups(address)}
              </span>
            </ReviewRow>
            <ReviewRow label={t("withdraw.review.amount")}>
              {t("withdraw.sats", {
                amount: formatSatsAmount(quote.amountSats, locale),
              })}
            </ReviewRow>
            <ReviewRow label={t("withdraw.review.fee")}>
              {t("withdraw.sats", {
                amount: formatSatsAmount(feeEstimate.totalFeeSats, locale),
              })}
            </ReviewRow>
            <ReviewRow label={t("withdraw.review.total")} emphasize>
              {t("withdraw.sats", {
                amount: formatSatsAmount(totalSats, locale),
              })}
            </ReviewRow>
          </dl>

          <p className="text-sm text-muted-foreground">
            {t("withdraw.review.warning")}
          </p>

          <FieldError>{confirmError ? t(confirmError) : null}</FieldError>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={confirmPending}
        >
          <ArrowLeftIcon />
          {t("withdraw.review.back")}
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={onConfirm}
          disabled={confirmPending}
        >
          {confirmPending ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : null}
          {confirmPending
            ? t("withdraw.review.confirming")
            : t("withdraw.review.confirm")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function ReviewRow({
  label,
  emphasize,
  stacked,
  children,
}: {
  readonly label: string
  readonly emphasize?: boolean
  readonly stacked?: boolean
  readonly children: React.ReactNode
}) {
  return (
    <div
      className={
        stacked
          ? "flex flex-col gap-1"
          : "flex items-center justify-between gap-4"
      }
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasize ? "font-semibold" : undefined}>{children}</dd>
    </div>
  )
}
