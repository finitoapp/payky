import { usePermission } from "@dedalik/use-react"
import { useQuery } from "@tanstack/react-query"
import type { BarcodeFormat } from "barcode-detector"
import {
  ClipboardPasteIcon,
  LoaderCircleIcon,
  ScanLineIcon,
} from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { ScanCodeScannerDialog } from "@/components/scan-code-scanner-dialog.tsx"
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
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { PositiveIntegerSchema } from "@/core/modules/shared/schema.ts"
import {
  quoteWithdrawal,
  type WithdrawalQuote,
} from "@/core/modules/withdraw/withdraw-actions.ts"
import {
  parseWithdrawDestination,
  type WithdrawDestination,
} from "@/core/modules/withdraw/withdraw-destination-utils.ts"
import { ONCHAIN_WITHDRAWAL_MIN_SATS } from "@/core/modules/withdraw/withdraw-utils.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useLnurlPayMetadata } from "@/hooks/use-lnurl-pay-metadata.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatSatsAmount, shortenMiddle } from "@/lib/format-utils.ts"
import { useBtcFiat } from "./use-btc-fiat.ts"
import {
  destinationErrorKeys,
  draftAmountSats,
  quoteErrorMessage,
  type WithdrawDraft,
  type WithdrawRequest,
} from "./withdraw-flow.ts"
import { LightningAddress } from "./withdraw-lightning-address.tsx"

/** A destination is always a QR code; one stable array, not one per render. */
const DESTINATION_SCAN_FORMATS: Array<BarcodeFormat> = ["qr_code"]

const destinationKindKeys = {
  onchain: "withdraw.destination.kind.onchain",
  "lightning-invoice": "withdraw.destination.kind.lightningInvoice",
  "lightning-address": "withdraw.destination.kind.lightningAddress",
  unsupported: "withdraw.destination.invalid",
} satisfies Record<WithdrawDestination["kind"], TranslationKey>

const unsupportedKeys = {
  spark: "withdraw.error.sparkDestinationNotSupported",
  lnurl: "withdraw.error.lnurlNotSupported",
} satisfies Record<
  Extract<WithdrawDestination, { kind: "unsupported" }>["reason"],
  TranslationKey
>

/** What the destination field says under itself while the merchant types. */
const describeDestination = (
  raw: string,
  parsed: ReturnType<typeof parseWithdrawDestination>
): {
  readonly hint: TranslationKey | null
  readonly error: TranslationKey | null
} => {
  if (raw.trim() === "") return { hint: null, error: null }
  if (!parsed.ok) {
    // An address half typed is not an error yet; a wrong network stays one.
    return parsed.error.type === "LightningInvoiceWrongNetwork"
      ? { hint: null, error: destinationErrorKeys[parsed.error.type] }
      : { hint: null, error: null }
  }
  if (parsed.value.kind === "unsupported") {
    return { hint: null, error: unsupportedKeys[parsed.value.reason] }
  }
  return { hint: destinationKindKeys[parsed.value.kind], error: null }
}

/** Why "Withdraw all" is off for this destination, or `null` when it is offered. */
const withdrawAllUnavailableKey = (
  destination: WithdrawDestination | null
): TranslationKey | null => {
  if (destination?.kind === "lightning-address") {
    return "withdraw.all.unavailableAddress"
  }
  if (
    destination?.kind === "lightning-invoice" &&
    destination.amountSats !== null
  ) {
    return "withdraw.all.unavailableInvoice"
  }
  return null
}

const isSupportedDestination = (raw: string): boolean => {
  const parsed = parseWithdrawDestination(raw)
  return parsed.ok && parsed.value.kind !== "unsupported"
}

/**
 * A destination already on the clipboard, read only when the browser grants
 * clipboard access without asking: reading on open must never raise a
 * permission prompt.
 */
const useClipboardDestination = (current: string): string | null => {
  const permission = usePermission("clipboard-read" as PermissionName)
  const { data: suggestion = null } = useQuery({
    queryKey: ["withdraw", "clipboard-destination"],
    queryFn: async () => {
      const text = (await navigator.clipboard.readText()).trim()
      return isSupportedDestination(text) ? text : null
    },
    enabled: permission === "granted",
    retry: false,
  })

  return suggestion !== null && suggestion !== current.trim()
    ? suggestion
    : null
}

export function WithdrawFormStep({
  accountId,
  availableSats,
  draft,
  onDraftChange,
  onReview,
}: {
  readonly accountId: AccountId
  readonly availableSats: number | null
  readonly draft: WithdrawDraft
  readonly onDraftChange: (draft: WithdrawDraft) => void
  readonly onReview: (request: WithdrawRequest, quote: WithdrawalQuote) => void
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const locale = useLocale()
  const fiat = useBtcFiat()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const clipboardDestination = useClipboardDestination(draft.destination)

  const update = (patch: Partial<WithdrawDraft>) => {
    setSubmitError(null)
    onDraftChange({ ...draft, ...patch })
  }

  const parsed = parseWithdrawDestination(draft.destination)
  const destination = parsed.ok ? parsed.value : null
  const { hint, error: destinationError } = describeDestination(
    draft.destination,
    parsed
  )
  const invoiceAmountSats =
    destination?.kind === "lightning-invoice" ? destination.amountSats : null
  const withdrawAllUnavailable = withdrawAllUnavailableKey(destination)
  const effectiveWithdrawAll =
    draft.withdrawAll && withdrawAllUnavailable === null
  const typedSats = draftAmountSats(draft, fiat)

  const lightningAddress = useDebouncedValue(
    destination?.kind === "lightning-address" ? destination.address : null,
    500
  )
  const metadataQuery = useLnurlPayMetadata(lightningAddress)
  const addressSettled =
    destination?.kind === "lightning-address" &&
    lightningAddress === destination.address
  const checkingAddress =
    destination?.kind === "lightning-address" &&
    (!addressSettled || metadataQuery.isFetching)
  const range =
    addressSettled && !metadataQuery.isFetching
      ? (metadataQuery.data ?? null)
      : null
  const addressUnavailable =
    addressSettled && !metadataQuery.isFetching && metadataQuery.isError
  const outOfRange =
    range !== null &&
    typedSats !== null &&
    (typedSats < range.minSendableSats || typedSats > range.maxSendableSats)
  const belowOnchainMinimum =
    destination?.kind === "onchain" &&
    !effectiveWithdrawAll &&
    typedSats !== null &&
    typedSats < ONCHAIN_WITHDRAWAL_MIN_SATS

  const changeDestination = (value: string) => {
    const next = parseWithdrawDestination(value)
    if (next.ok && next.value.kind === "onchain" && next.value.amountSats) {
      update({
        destination: value,
        withdrawAll: false,
        unit: "sats",
        amount: String(next.value.amountSats),
      })
      return
    }
    update({ destination: value })
  }

  const pasteDestination = async () => {
    try {
      changeDestination((await navigator.clipboard.readText()).trim())
    } catch {
      toast.error(t("withdraw.destination.pasteError"))
    }
  }

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    if (destination === null || destination.kind === "unsupported") {
      setSubmitError(t(destinationError ?? "withdraw.destination.invalid"))
      return
    }

    let amountSats: WithdrawRequest["amountSats"]
    if (invoiceAmountSats === null && !effectiveWithdrawAll) {
      const amount = PositiveIntegerSchema.safeParse(typedSats)
      if (!amount.success) {
        setSubmitError(t("withdraw.amount.invalid"))
        return
      }
      amountSats = amount.data
    }

    const request: WithdrawRequest = { destination, amountSats }
    setPending(true)
    try {
      await using run = appRun()
      const result = await run(quoteWithdrawal({ accountId, ...request }))
      if (!result.ok) {
        setSubmitError(quoteErrorMessage(result.error, t))
        return
      }
      onReview(request, result.value)
    } catch {
      setSubmitError(t("withdraw.quoteError.generic"))
    } finally {
      setPending(false)
    }
  }

  const sats = (amount: number) => formatSatsAmount(amount, locale)
  const equivalent =
    typedSats === null
      ? null
      : draft.unit === "sats"
        ? fiat.approx(typedSats)
        : t("withdraw.sats", { amount: sats(typedSats) })

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
                <FieldLabel htmlFor="withdraw-destination">
                  {t("withdraw.destination.label")}
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="withdraw-destination"
                    value={draft.destination}
                    placeholder={t("withdraw.destination.placeholder")}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={destinationError !== null}
                    onChange={(event) => changeDestination(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("withdraw.destination.paste")}
                    onClick={() => void pasteDestination()}
                  >
                    <ClipboardPasteIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("withdraw.destination.scan")}
                    onClick={() => setScannerOpen(true)}
                  >
                    <ScanLineIcon />
                  </Button>
                </div>
                {clipboardDestination !== null ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-fit max-w-full"
                    onClick={() => changeDestination(clipboardDestination)}
                  >
                    <ClipboardPasteIcon />
                    <span className="truncate">
                      {t("withdraw.clipboard.use", {
                        value: shortenMiddle(clipboardDestination, 16, 8),
                      })}
                    </span>
                  </Button>
                ) : null}
                {destination?.kind === "lightning-address" ? (
                  <FieldDescription>
                    <LightningAddress address={destination.address} />
                  </FieldDescription>
                ) : null}
                {hint !== null ? (
                  <FieldDescription>{t(hint)}</FieldDescription>
                ) : null}
                {checkingAddress ? (
                  <FieldDescription className="flex items-center gap-1">
                    <LoaderCircleIcon className="size-3 animate-spin" />
                    {t("withdraw.destination.checkingAddress")}
                  </FieldDescription>
                ) : null}
                <FieldError>
                  {destinationError
                    ? t(destinationError)
                    : addressUnavailable
                      ? t("withdraw.error.lightningAddressUnavailable")
                      : null}
                </FieldError>
              </Field>

              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="withdraw-amount">
                    {t("withdraw.amount.label")}
                  </FieldLabel>
                  {invoiceAmountSats === null ? (
                    <ToggleGroup<WithdrawDraft["unit"]>
                      value={[draft.unit]}
                      onValueChange={([unit]) => {
                        if (unit) update({ unit, amount: "" })
                      }}
                      variant="outline"
                      size="sm"
                      aria-label={t("withdraw.amount.unit")}
                      disabled={effectiveWithdrawAll}
                    >
                      <ToggleGroupItem value="sats">
                        {t("withdraw.amount.unitSats")}
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="fiat"
                        disabled={fiat.rate === null}
                      >
                        {fiat.currency}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  ) : null}
                </div>
                <Input
                  id="withdraw-amount"
                  inputMode={draft.unit === "sats" ? "numeric" : "decimal"}
                  disabled={effectiveWithdrawAll || invoiceAmountSats !== null}
                  aria-invalid={outOfRange || belowOnchainMinimum}
                  value={
                    invoiceAmountSats !== null
                      ? String(invoiceAmountSats)
                      : draft.amount
                  }
                  placeholder={
                    draft.unit === "sats"
                      ? t("withdraw.amount.placeholder")
                      : t("withdraw.amount.placeholderFiat", {
                          currency: fiat.currency,
                        })
                  }
                  onChange={(event) => update({ amount: event.target.value })}
                />
                {invoiceAmountSats !== null ? (
                  <FieldDescription>
                    {t("withdraw.amount.fromInvoice")}{" "}
                    {fiat.approx(invoiceAmountSats)}
                  </FieldDescription>
                ) : equivalent !== null && !effectiveWithdrawAll ? (
                  <FieldDescription>{equivalent}</FieldDescription>
                ) : null}
                {range !== null ? (
                  <FieldDescription
                    className={outOfRange ? "text-destructive" : undefined}
                  >
                    {t("withdraw.amount.range", {
                      min: sats(range.minSendableSats),
                      max: sats(range.maxSendableSats),
                    })}
                  </FieldDescription>
                ) : null}
                {destination?.kind === "onchain" ? (
                  <FieldDescription
                    className={
                      belowOnchainMinimum ? "text-destructive" : undefined
                    }
                  >
                    {t("withdraw.amount.onchainMinimum", {
                      amount: sats(ONCHAIN_WITHDRAWAL_MIN_SATS),
                    })}
                  </FieldDescription>
                ) : null}
                {availableSats !== null ? (
                  <FieldDescription>
                    {t("withdraw.amount.available", {
                      amount: sats(availableSats),
                    })}{" "}
                    {fiat.approx(availableSats)}
                  </FieldDescription>
                ) : null}
              </Field>

              <Field orientation="horizontal">
                <Checkbox
                  id="withdraw-all"
                  checked={effectiveWithdrawAll}
                  disabled={withdrawAllUnavailable !== null}
                  onCheckedChange={(checked) =>
                    update({ withdrawAll: checked === true })
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor="withdraw-all">
                    {t("withdraw.all.label")}
                  </FieldLabel>
                  <FieldDescription>
                    {t(withdrawAllUnavailable ?? "withdraw.all.description")}
                  </FieldDescription>
                </FieldContent>
              </Field>

              <FieldError>{submitError}</FieldError>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
              {pending ? t("withdraw.quotePending") : t("withdraw.continue")}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <ScanCodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        title={t("withdraw.scan.title")}
        formats={DESTINATION_SCAN_FORMATS}
        onScan={(raw) => changeDestination(raw.trim())}
      />
    </>
  )
}
