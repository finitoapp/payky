import type { InferRow } from "@evolu/common"
import { parseISO } from "date-fns"
import { useStore } from "jotai"
import { MinusIcon, PlusIcon, RotateCwIcon, Undo2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { accountAtom } from "@/atoms/account.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
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
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import type { EetDeliveryOutcome } from "@/core/integrations/eet/eet-client.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  type DeliverEetReversalError,
  deliverEetReversal,
} from "@/core/modules/eet/eet-actions.ts"
import { eetReversalsByPaymentIdQuery } from "@/core/modules/eet/eet-queries.ts"
import type { EetUnsupportedReason } from "@/core/modules/eet/eet-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { PaymentLineId } from "@/core/modules/payment-line/payment-line-types.ts"
import {
  type RefundPaymentError,
  refundPayment,
} from "@/core/modules/refund/refund-actions.ts"
import {
  otherClaimedPaymentOfBillQuery,
  refundablePaymentLinesQuery,
  refundLinesByPaymentIdQuery,
  refundsByPaymentIdQuery,
} from "@/core/modules/refund/refund-queries.ts"
import type { RefundMethod } from "@/core/modules/refund/refund-types.ts"
import {
  calculateRefundLineAmount,
  deriveRefundableAmount,
  deriveRefundableLines,
  type RefundableLine,
  sumRefundAmounts,
} from "@/core/modules/refund/refund-utils.ts"
import {
  decimalAmountToMinorUnits,
  minorUnitsToDecimalString,
} from "@/core/modules/shared/money.ts"
import {
  type FiatCurrency,
  Integer,
  type ItemLineType,
  type NonEmptyString255,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import {
  EetSaleStatusBadge,
  useEetSaleStatus,
} from "@/features/shared/eet-sale-status.tsx"
import { RefundBadge } from "@/features/shared/refund-badge.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"

type RefundMode = "amount" | "items"

interface RefundablePaymentLine {
  readonly id: PaymentLineId
  readonly type: ItemLineType
  readonly quantity: PositiveNumber
  readonly totalAmount: NonNegativeInteger
  readonly name: NonEmptyString255
}

const refundMethodLabelKey = {
  cashRegister: "paymentDetail.refunds.method.cashRegister",
  outside: "paymentDetail.refunds.method.outside",
} satisfies Record<RefundMethod, TranslationKey>

const refundErrorKeys = {
  PaymentNotFound: "paymentDetail.notFound",
  RefundPaymentNotPaid: "refund.error.notPaid",
  RefundAmountInvalid: "refund.error.amount",
  RefundItemsUnavailable: "refund.error.items",
  RefundLineUnavailable: "refund.error.items",
  CashRegisterAccountNotFound: "refund.error.cashRegister",
} satisfies Record<RefundPaymentError["type"], TranslationKey>

export function PaymentDetailRefunds({
  payment,
  isPaid,
  defaultMethod,
}: {
  readonly payment: {
    readonly id: PaymentId
    readonly billId: BillId | null
    readonly amount: NonNegativeInteger
    readonly currency: FiatCurrency
    readonly cashReceivedAmount: NonNegativeInteger | null
  }
  readonly isPaid: boolean
  readonly defaultMethod: RefundMethod
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { data: refunds } = useEvoluQuery(refundsByPaymentIdQuery(payment.id))
  const { data: refundLines } = useEvoluQuery(
    refundLinesByPaymentIdQuery(payment.id)
  )
  const { data: paymentLines } = useEvoluQuery(
    refundablePaymentLinesQuery(payment.id)
  )
  const { data: otherClaimedPayments } = useEvoluQuery(
    otherClaimedPaymentOfBillQuery(payment.id)
  )
  const { data: reversals } = useEvoluQuery(
    eetReversalsByPaymentIdQuery(payment.id)
  )
  const remainingAmount = NonNegativeInteger(
    Math.max(0, deriveRefundableAmount(payment) - sumRefundAmounts(refunds))
  )
  const refundableLines =
    payment.billId === null || otherClaimedPayments.length > 0
      ? []
      : deriveRefundableLines(paymentLines, refundLines)
  const canRefund = isPaid && remainingAmount > 0
  const formatAmount = (value: NonNegativeInteger) =>
    formatMoney({ value, currency: payment.currency }, locale)

  if (refunds.length === 0 && !canRefund) return null

  const refundButton = canRefund ? (
    <Button
      type="button"
      variant="outline"
      className="h-12"
      onClick={() => setDialogOpen(true)}
    >
      <Undo2Icon data-icon="inline-start" />
      {t("paymentDetail.refunds.action")}
    </Button>
  ) : null

  return (
    <>
      {refunds.length === 0 ? (
        refundButton
      ) : (
        <Card data-testid="payment-detail-refunds">
          <CardHeader>
            <CardTitle>{t("paymentDetail.refunds.title")}</CardTitle>
            <CardAction>
              <RefundBadge
                summary={{
                  refundedAmount: sumRefundAmounts(refunds),
                  refundableAmount: deriveRefundableAmount(payment),
                  currency: payment.currency,
                }}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col divide-y">
              {refunds.map((refund) => (
                <div
                  key={refund.id}
                  className="flex flex-col gap-1 py-2 first:pt-0"
                  data-testid="payment-detail-refund"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">
                      {formatAmount(refund.amount)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(refundMethodLabelKey[refund.method])} ·{" "}
                      {formatDateTime(new Date(refund.refundedAt), locale)}
                    </span>
                  </div>
                  {refundLines
                    .filter((line) => line.refundId === refund.id)
                    .map((line) => (
                      <span
                        key={line.id}
                        className="text-xs text-muted-foreground"
                      >
                        {line.quantity} × {line.name}
                      </span>
                    ))}
                  {reversals
                    .filter((reversal) => reversal.refundId === refund.id)
                    .map((reversal) => (
                      <RefundEetReversal
                        key={reversal.id}
                        reversal={reversal}
                      />
                    ))}
                </div>
              ))}
            </div>
            {refundButton}
          </CardContent>
        </Card>
      )}
      {dialogOpen ? (
        <RefundDialog
          paymentId={payment.id}
          currency={payment.currency}
          remainingAmount={remainingAmount}
          refundableLines={refundableLines}
          defaultMethod={defaultMethod}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </>
  )
}

function RefundDialog({
  paymentId,
  currency,
  remainingAmount,
  refundableLines,
  defaultMethod,
  onClose,
}: {
  readonly paymentId: PaymentId
  readonly currency: FiatCurrency
  readonly remainingAmount: NonNegativeInteger
  readonly refundableLines: ReadonlyArray<RefundableLine<RefundablePaymentLine>>
  readonly defaultMethod: RefundMethod
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const runToast = useRunToast()
  const jotaiStore = useStore()
  const [mode, setMode] = useState<RefundMode>("amount")
  const [method, setMethod] = useState<RefundMethod>(defaultMethod)
  const [amountText, setAmountText] = useState<string>(() =>
    minorUnitsToDecimalString({ value: remainingAmount, currency })
  )
  const [quantities, setQuantities] = useState<
    Readonly<Partial<Record<PaymentLineId, number>>>
  >({})
  const [pending, setPending] = useState(false)
  const formatAmount = (value: NonNegativeInteger) =>
    formatMoney({ value, currency }, locale)

  const parsedAmount = decimalAmountToMinorUnits({
    currency,
    value: amountText,
  })
  const typedAmount =
    parsedAmount === null || parsedAmount > remainingAmount
      ? null
      : NonNegativeInteger(parsedAmount)
  const chosenLines = refundableLines.flatMap((refundable) => {
    const quantity = quantities[refundable.line.id] ?? 0
    return quantity > 0
      ? [
          {
            paymentLineId: refundable.line.id,
            quantity: PositiveNumber(quantity),
            amount: calculateRefundLineAmount(refundable, quantity),
          },
        ]
      : []
  })
  const itemsAmount = sumRefundAmounts(chosenLines)
  const refundAmount =
    mode === "amount"
      ? typedAmount
      : itemsAmount > 0 && itemsAmount <= remainingAmount
        ? itemsAmount
        : null

  const stepQuantity = (
    refundable: RefundableLine<RefundablePaymentLine>,
    step: 1 | -1
  ) => {
    const current = quantities[refundable.line.id] ?? 0
    const next =
      step === 1
        ? Math.min(refundable.remainingQuantity, current + 1)
        : Math.max(0, current - 1)
    setQuantities({ ...quantities, [refundable.line.id]: next })
  }

  const confirm = async () => {
    if (refundAmount === null || pending) return
    setPending(true)
    const { device } = await jotaiStore.get(accountAtom)
    const refunded = await runToast(async (run) => {
      const result = await run(
        refundPayment(
          mode === "amount"
            ? { paymentId, method, deviceId: device.id, amount: refundAmount }
            : {
                paymentId,
                method,
                deviceId: device.id,
                lines: chosenLines.map(({ paymentLineId, quantity }) => ({
                  paymentLineId,
                  quantity,
                })),
              }
        )
      )
      if (!result.ok) return refundErrorKeys[result.error.type]
      return undefined
    })
    setPending(false)
    if (refunded) {
      toast.success(t("refund.created"))
      onClose()
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("refund.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("refund.dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {refundableLines.length > 0 ? (
            <ToggleGroup
              aria-label={t("refund.dialog.mode.label")}
              className="grid w-full grid-cols-2"
              variant="outline"
              disabled={pending}
              value={[mode]}
              onValueChange={(values) => {
                const [value] = values
                if (value === "amount" || value === "items") setMode(value)
              }}
            >
              <ToggleGroupItem value="amount">
                {t("refund.dialog.mode.amount")}
              </ToggleGroupItem>
              <ToggleGroupItem value="items">
                {t("refund.dialog.mode.items")}
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}

          {mode === "amount" ? (
            <Field data-invalid={typedAmount === null}>
              <FieldLabel htmlFor="refund-amount">
                {t("refund.dialog.amount.label")}
              </FieldLabel>
              <Input
                id="refund-amount"
                value={amountText}
                inputMode="decimal"
                autoComplete="off"
                disabled={pending}
                aria-invalid={typedAmount === null}
                onChange={(event) => setAmountText(event.currentTarget.value)}
              />
              <FieldError>
                {typedAmount === null
                  ? t("refund.dialog.amount.invalid", {
                      amount: formatAmount(remainingAmount),
                    })
                  : null}
              </FieldError>
            </Field>
          ) : (
            <FieldSet>
              <FieldLegend variant="label">
                {t("refund.dialog.items.label")}
              </FieldLegend>
              <div className="flex flex-col divide-y">
                {refundableLines.map((refundable) => {
                  const quantity = quantities[refundable.line.id] ?? 0
                  return (
                    <div
                      key={refundable.line.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {refundable.line.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("refund.dialog.items.available", {
                            quantity: String(refundable.remainingQuantity),
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          disabled={pending || quantity === 0}
                          aria-label={t("refund.dialog.items.decrease", {
                            name: refundable.line.name,
                          })}
                          onClick={() => stepQuantity(refundable, -1)}
                        >
                          <MinusIcon />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">
                          {quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          disabled={
                            pending || quantity >= refundable.remainingQuantity
                          }
                          aria-label={t("refund.dialog.items.increase", {
                            name: refundable.line.name,
                          })}
                          onClick={() => stepQuantity(refundable, 1)}
                        >
                          <PlusIcon />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </FieldSet>
          )}

          <FieldSet>
            <FieldLegend variant="label">
              {t("refund.dialog.method.label")}
            </FieldLegend>
            <ToggleGroup
              aria-label={t("refund.dialog.method.label")}
              className="grid w-full grid-cols-1 gap-2"
              variant="outline"
              disabled={pending}
              value={[method]}
              onValueChange={(values) => {
                const [value] = values
                if (value === "cashRegister" || value === "outside") {
                  setMethod(value)
                }
              }}
            >
              <ToggleGroupItem value="cashRegister" className="justify-start">
                {t("refund.dialog.method.cashRegister")}
              </ToggleGroupItem>
              <ToggleGroupItem value="outside" className="justify-start">
                {t("refund.dialog.method.outside")}
              </ToggleGroupItem>
            </ToggleGroup>
          </FieldSet>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            {t("refund.dialog.cancel")}
          </Button>
          <Button
            type="button"
            disabled={refundAmount === null || pending}
            onClick={() => void confirm()}
          >
            {refundAmount === null
              ? t("refund.dialog.confirmEmpty")
              : t("refund.dialog.confirm", {
                  amount: formatAmount(refundAmount),
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type RefundEetReversalRow = InferRow<
  ReturnType<typeof eetReversalsByPaymentIdQuery>
>

const reversalRetryErrorKeys = {
  EetSaleNotFoundError: "paymentDetail.eet.retry.failed",
  EetSaleAlreadyConfirmedError: "paymentDetail.eet.retry.alreadyConfirmed",
  EetSaleUnsupportedError: "paymentDetail.eet.retry.unsupported",
  EetSaleBusyError: "paymentDetail.eet.retry.busy",
  EetSigningCertificateMissingError: "paymentDetail.eet.retry.noCertificate",
  EetReversalWaitingForSaleError: "paymentDetail.eet.reversal.waiting",
} satisfies Record<DeliverEetReversalError["type"], TranslationKey>

const reversalRetryOutcomeKeys = {
  accepted: "paymentDetail.eet.reversal.retry.confirmed",
  verified: "paymentDetail.eet.reversal.retry.confirmed",
  retry: "paymentDetail.eet.retry.pending",
  rejected: "paymentDetail.eet.reversal.retry.rejected",
} satisfies Record<EetDeliveryOutcome["type"], TranslationKey>

const reversalUnsupportedKeys = {
  currency: "paymentDetail.eet.unsupported",
  amount: "paymentDetail.eet.unsupported",
  disabled: "paymentDetail.eet.reversal.unsupported.disabled",
  environment: "paymentDetail.eet.reversal.unsupported.environment",
  taxpayer: "paymentDetail.eet.reversal.unsupported.taxpayer",
} satisfies Record<EetUnsupportedReason, TranslationKey>

function RefundEetReversal({
  reversal,
}: {
  readonly reversal: RefundEetReversalRow
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const runToast = useRunToast()
  const [retrying, setRetrying] = useState(false)
  const { status, isOverdue } = useEetSaleStatus(reversal)
  const isWaitingForSale = status === "pending" && reversal.salePok === null
  const canRetry =
    !isWaitingForSale && (status === "pending" || status === "rejected")
  const lastError =
    reversal.pok !== null || reversal.lastErrorMessage === null
      ? null
      : reversal.lastErrorCode === null
        ? reversal.lastErrorMessage
        : t("paymentDetail.eet.errorCode", {
            code: String(reversal.lastErrorCode),
            message: reversal.lastErrorMessage,
          })

  const retry = async () => {
    setRetrying(true)
    await runToast(async (run) => {
      const result = await run(deliverEetReversal(reversal.id))
      if (!result.ok) return reversalRetryErrorKeys[result.error.type]
      const outcomeKey = reversalRetryOutcomeKeys[result.value.type]
      if (result.value.type === "rejected") return outcomeKey
      toast.success(t(outcomeKey))
      return undefined
    })
    setRetrying(false)
  }

  return (
    <div
      className="mt-1 flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 text-xs"
      data-testid="payment-detail-eet-reversal"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {t("paymentDetail.eet.reversal.title", {
            amount: formatMoney(
              {
                value: Integer(-reversal.amount),
                currency: reversal.currency,
              },
              locale
            ),
          })}
        </span>
        <EetSaleStatusBadge sale={reversal} />
      </div>
      {isWaitingForSale ? (
        <p className="text-muted-foreground">
          {t("paymentDetail.eet.reversal.waiting")}
        </p>
      ) : null}
      {isOverdue ? (
        <p className="text-destructive">{t("paymentDetail.eet.overdue")}</p>
      ) : null}
      {reversal.unsupportedReason === null ? null : (
        <p className="text-destructive">
          {t(reversalUnsupportedKeys[reversal.unsupportedReason])}
        </p>
      )}
      {reversal.pok === null ? null : (
        <p className="break-all text-muted-foreground">
          {t("paymentDetail.eet.pok")}:{" "}
          <span className="font-mono">{reversal.pok}</span>
        </p>
      )}
      {reversal.receivedAt === null ? null : (
        <p className="text-muted-foreground">
          {t("paymentDetail.eet.receivedAt")}:{" "}
          {formatDateTime(parseISO(reversal.receivedAt), locale)}
        </p>
      )}
      {lastError === null ? null : (
        <p className="text-muted-foreground">
          {t("paymentDetail.eet.lastError")}: {lastError}
        </p>
      )}
      {canRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={retrying}
          onClick={() => void retry()}
        >
          <RotateCwIcon data-icon="inline-start" />
          {t("paymentDetail.eet.retry")}
        </Button>
      ) : null}
    </div>
  )
}
