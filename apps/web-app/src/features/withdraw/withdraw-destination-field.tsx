import { usePermission } from "@dedalik/use-react"
import {
  describeDestination,
  isPayableDestination,
} from "@payky/app-shared/withdraw-destination"
import type { WithdrawMethod } from "@payky/app-shared/withdraw-flow"
import { parseWithdrawDestination } from "@payky/core/modules/withdraw/withdraw-destination-utils"
import { shortenMiddle } from "@payky/core/utils/shorten-middle"
import { useQuery } from "@tanstack/react-query"
import type { BarcodeFormat } from "barcode-detector"
import {
  ClipboardPasteIcon,
  LoaderCircleIcon,
  ScanLineIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ScanCodeScannerDialog } from "@/components/scan-code-scanner-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useLnurlPayMetadata } from "@/hooks/use-lnurl-pay-metadata.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { LightningAddress } from "./withdraw-lightning-address.tsx"

/** A destination is always a QR code; one stable array, not one per render. */
const DESTINATION_SCAN_FORMATS: Array<BarcodeFormat> = ["qr_code"]

/**
 * A destination already on the clipboard, read only when the browser grants
 * clipboard access without asking: reading on open must never raise a
 * permission prompt.
 */
const useClipboardDestination = (
  current: string,
  method: WithdrawMethod
): string | null => {
  const permission = usePermission("clipboard-read" as PermissionName)
  const { data: suggestion = null } = useQuery({
    queryKey: ["withdraw", "clipboard-destination", method],
    queryFn: async () => {
      const text = (await navigator.clipboard.readText()).trim()
      return isPayableDestination(text, method) ? text : null
    },
    enabled: permission === "granted",
    retry: false,
  })

  return suggestion !== null && suggestion !== current.trim()
    ? suggestion
    : null
}

export type WithdrawDestinationState = ReturnType<typeof useWithdrawDestination>

/**
 * The typed destination as `method` sees it: parsed (`null` until it is one
 * `method` can pay), its hint or error, and for a Lightning address the
 * range and comment length its LNURL metadata allows.
 */
export const useWithdrawDestination = (raw: string, method: WithdrawMethod) => {
  const parsed = parseWithdrawDestination(raw)
  const { hint, error } = describeDestination(raw, parsed, method)
  const destination = parsed.ok && error === null ? parsed.value : null

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

  return {
    destination,
    hint,
    error,
    checkingAddress,
    range,
    addressUnavailable:
      addressSettled && !metadataQuery.isFetching && metadataQuery.isError,
    /** The longest LUD-12 comment the Lightning address accepts, 0 for none. */
    commentAllowed: range?.commentAllowed ?? 0,
    /** The invoice's own amount, which no amount typed can change. */
    invoiceAmountSats:
      destination?.kind === "lightning-invoice" ? destination.amountSats : null,
  }
}

/** The destination input with paste, scan, the clipboard's suggestion and what it parsed as. */
export function WithdrawDestinationField({
  value,
  onChange,
  state,
  method,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly state: WithdrawDestinationState
  readonly method: WithdrawMethod
}) {
  const { t } = useTranslation()
  const [scannerOpen, setScannerOpen] = useState(false)
  const clipboardDestination = useClipboardDestination(value, method)
  const { destination, hint, error, checkingAddress, addressUnavailable } =
    state

  const pasteDestination = async () => {
    try {
      onChange((await navigator.clipboard.readText()).trim())
    } catch {
      toast.error(t("withdraw.destination.pasteError"))
    }
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="withdraw-destination">
          {t("withdraw.destination.label")}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id="withdraw-destination"
            value={value}
            placeholder={t(
              method === "spark"
                ? "withdraw.destination.placeholder"
                : "withdraw.cashu.destinationPlaceholder"
            )}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error !== null}
            onChange={(event) => onChange(event.target.value)}
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
            onClick={() => onChange(clipboardDestination)}
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
        {hint !== null ? <FieldDescription>{t(hint)}</FieldDescription> : null}
        {checkingAddress ? (
          <FieldDescription className="flex items-center gap-1">
            <LoaderCircleIcon className="size-3 animate-spin" />
            {t("withdraw.destination.checkingAddress")}
          </FieldDescription>
        ) : null}
        <FieldError>
          {error !== null
            ? t(error)
            : addressUnavailable
              ? t("withdraw.error.lightningAddressUnavailable")
              : null}
        </FieldError>
      </Field>
      <ScanCodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        title={t("withdraw.scan.title")}
        formats={DESTINATION_SCAN_FORMATS}
        onScan={(raw) => onChange(raw.trim())}
      />
    </>
  )
}
