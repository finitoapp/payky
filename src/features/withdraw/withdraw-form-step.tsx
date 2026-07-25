import type { AbortError } from "@evolu/common"
import assertNever from "assert-never"
import {
  ClipboardPasteIcon,
  LoaderCircleIcon,
  ScanLineIcon,
} from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"

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
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { PositiveIntegerSchema } from "@/core/modules/shared/schema.ts"
import {
  quoteWithdrawal,
  type WithdrawalQuote,
} from "@/core/modules/withdrawal/withdrawal-actions.ts"
import type { QuoteWithdrawalError } from "@/core/modules/withdrawal/withdrawal-types.ts"
import { isValidBitcoinAddress } from "@/core/modules/withdrawal/withdrawal-utils.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { WithdrawQrScanner } from "./withdraw-qr-scanner.tsx"
import {
  formatSatsAmount,
  type ScannedBitcoinAddress,
} from "./withdraw-utils.ts"

const quoteErrorKey = (
  error: QuoteWithdrawalError | AbortError
): TranslationKey => {
  switch (error.type) {
    case "AbortError":
      return "withdraw.quoteError.generic"
    case "WithdrawalAccountNotFound":
      return "withdraw.error.accountNotFound"
    case "InvalidBitcoinAddress":
      return "withdraw.address.invalid"
    case "InsufficientWithdrawalBalance":
      return "withdraw.error.insufficientBalance"
    case "WithdrawalQuoteFailed":
      return "withdraw.quoteError.generic"
  }

  return assertNever(error)
}

export function WithdrawFormStep({
  accountId,
  availableSats,
  onReview,
}: {
  readonly accountId: AccountId
  readonly availableSats: number | null
  readonly onReview: (address: string, quote: WithdrawalQuote) => void
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const locale = useLocale()
  const [address, setAddress] = useState("")
  const [addressError, setAddressError] = useState<TranslationKey | null>(null)
  const [amountInput, setAmountInput] = useState("")
  const [withdrawAll, setWithdrawAll] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [quotePending, setQuotePending] = useState(false)
  const [quoteError, setQuoteError] = useState<TranslationKey | null>(null)

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
          accountId,
          onchainAddress: trimmedAddress,
          amountSats: amountResult?.success ? amountResult.data : undefined,
        })
      )

      if (!quoteResult.ok) {
        setQuoteError(quoteErrorKey(quoteResult.error))
        return
      }

      onReview(trimmedAddress, quoteResult.value)
    } finally {
      setQuotePending(false)
    }
  }

  return (
    <>
      <form onSubmit={(event) => void submitForm(event)}>
        <Card>
          <CardHeader>
            <CardTitle>{t("withdraw.form.title")}</CardTitle>
            <CardDescription>{t("withdraw.form.description")}</CardDescription>
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
                <FieldError>{addressError ? t(addressError) : null}</FieldError>
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

      {scannerOpen ? (
        <WithdrawQrScanner
          onScan={applyScannedAddress}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
    </>
  )
}
