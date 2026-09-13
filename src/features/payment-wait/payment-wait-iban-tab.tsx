import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import {
  type BankQrPayload,
  isBankQrFormat,
} from "@/core/modules/payment/payment-iban-qr-payload-utils.ts"
import type { BankQrFormat } from "@/core/modules/shared/schema.ts"
import { QrPaymentRequest } from "@/features/payment-wait/payment-wait-qr-request.tsx"
import type { IbanPaidTabProps } from "@/features/payment-wait/payment-wait-types.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"
import { formatAddressGroups } from "@/lib/format-utils.ts"

const paymentWaitQrFormatShortLabelKeys = {
  payBySquare1_0_0: "paymentWait.qrFormatShort.payBySquare1_0_0",
  payBySquare1_2_0: "paymentWait.qrFormatShort.payBySquare1_2_0",
  spayd: "paymentWait.qrFormatShort.spayd",
} satisfies Record<BankQrFormat, TranslationKey>

export function IbanPaymentTab({
  defaultQrFormat,
  qrPayload,
  qrPayloads,
  iban,
  preparingMessageKey,
  selectedQrFormat,
  onSelectQrFormat,
  canMarkIbanPaid,
  ibanPaymentErrorKey,
  ibanPaymentPending,
  ibanVariableSymbol,
  onMarkIbanPaid,
}: {
  readonly defaultQrFormat: BankQrFormat
  readonly qrPayload: string | null
  readonly qrPayloads: ReadonlyArray<BankQrPayload>
  readonly iban: string | null
  readonly preparingMessageKey: TranslationKey | null
  readonly selectedQrFormat: BankQrFormat | null
  readonly onSelectQrFormat: (format: BankQrFormat) => void
} & IbanPaidTabProps) {
  const { t } = useTranslation()
  const activeQrFormat = selectedQrFormat ?? defaultQrFormat
  const [detailsVisible, setDetailsVisible] = useState(false)
  const hasDetails = iban !== null || ibanVariableSymbol !== null

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <QrPaymentRequest
        qrPayload={qrPayload}
        preparingMessageKey={preparingMessageKey}
      />
      {qrPayloads.length > 1 ? (
        <ToggleGroup<BankQrFormat>
          value={[activeQrFormat]}
          onValueChange={(value) => {
            const [nextFormat] = value
            if (isBankQrFormat(nextFormat)) {
              onSelectQrFormat(nextFormat)
            }
          }}
          variant="default"
          className="h-11 rounded-full border border-black/15 bg-background p-1 px-1.5 text-muted-foreground dark:border-white/15"
        >
          {qrPayloads.map((payload) => (
            <ToggleGroupItem
              key={payload.format}
              value={payload.format}
              aria-label={t(`paymentWait.qrFormat.${payload.format}`)}
              className="h-full min-w-12 -mx-0.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background aria-pressed:bg-foreground aria-pressed:text-background dark:data-[state=on]:bg-white dark:data-[state=on]:text-black dark:aria-pressed:bg-white dark:aria-pressed:text-black"
            >
              {t(paymentWaitQrFormatShortLabelKeys[payload.format])}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      {detailsVisible && hasDetails ? (
        <div className="flex w-full max-w-xs flex-col gap-2">
          {iban !== null ? (
            <CopyableDetailRow
              label={t("paymentWait.ibanDetails.iban.label")}
              value={iban}
              displayValue={formatAddressGroups(iban)}
              copyAriaLabel={t("paymentWait.ibanDetails.iban.copy")}
              copiedMessage={t("paymentWait.ibanDetails.iban.copied")}
              copyFailedMessage={t("paymentWait.ibanDetails.iban.copyError")}
            />
          ) : null}
          {ibanVariableSymbol !== null ? (
            <CopyableDetailRow
              label={t("paymentWait.ibanDetails.variableSymbol.label")}
              value={ibanVariableSymbol}
              copyAriaLabel={t("paymentWait.ibanDetails.variableSymbol.copy")}
              copiedMessage={t("paymentWait.ibanDetails.variableSymbol.copied")}
              copyFailedMessage={t(
                "paymentWait.ibanDetails.variableSymbol.copyError"
              )}
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {hasDetails ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={
              detailsVisible
                ? t("paymentWait.ibanDetails.hide")
                : t("paymentWait.ibanDetails.show")
            }
            aria-pressed={detailsVisible}
            onClick={() => {
              setDetailsVisible((current) => !current)
            }}
          >
            {detailsVisible ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!canMarkIbanPaid || ibanPaymentPending}
          onClick={onMarkIbanPaid}
        >
          {ibanPaymentPending ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <CheckIcon />
          )}
          {ibanPaymentPending
            ? t("paymentWait.ibanPaid.pending")
            : t("paymentWait.ibanPaid.action")}
        </Button>
      </div>
      {ibanPaymentErrorKey ? (
        <p className="text-sm font-medium text-destructive">
          {t(ibanPaymentErrorKey)}
        </p>
      ) : null}
    </div>
  )
}

function CopyableDetailRow({
  label,
  value,
  displayValue,
  copyAriaLabel,
  copiedMessage,
  copyFailedMessage,
}: {
  readonly label: string
  readonly value: string
  readonly displayValue?: string
  readonly copyAriaLabel: string
  readonly copiedMessage: string
  readonly copyFailedMessage: string
}) {
  const copyValue = () => {
    void copyToClipboard(value, {
      copied: copiedMessage,
      failed: copyFailedMessage,
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-black/15 px-3 py-2 dark:border-white/15">
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate font-mono text-sm">
          {displayValue ?? value}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={copyAriaLabel}
        onClick={copyValue}
      >
        <CopyIcon />
      </Button>
    </div>
  )
}
