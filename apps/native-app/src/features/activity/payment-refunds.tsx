import { formatDateTime } from "@payky/app-shared/format-date"
import { formatMoney } from "@payky/app-shared/format-money"
import {
  deriveRefundAmountText,
  deriveRefundAvailability,
  deriveRefundForm,
  type RefundablePaymentLine,
  type RefundMode,
  type RefundQuantities,
  refundErrorKeys,
  refundMethodLabelKey,
  stepRefundQuantity,
  tipRefundErrorKeys,
} from "@payky/app-shared/refund-form"
import type { BillId } from "@payky/core/modules/bill/bill-types"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import {
  refundPayment,
  refundPaymentTip,
} from "@payky/core/modules/refund/refund-actions"
import {
  otherClaimedPaymentOfBillQuery,
  refundablePaymentLinesQuery,
  refundLinesByPaymentIdQuery,
  refundsByPaymentIdQuery,
} from "@payky/core/modules/refund/refund-queries"
import type { RefundMethod } from "@payky/core/modules/refund/refund-types"
import {
  isTipRefund,
  type RefundableLine,
  sumGoodsRefundAmounts,
} from "@payky/core/modules/refund/refund-utils"
import type {
  FiatCurrency,
  NonNegativeInteger,
} from "@payky/core/modules/shared/schema"
import { useAtomValue } from "jotai"
import Minus from "lucide-react-native/icons/minus"
import Plus from "lucide-react-native/icons/plus"
import Undo2 from "lucide-react-native/icons/undo-2"
import { type ReactNode, useState } from "react"
import { Text, XStack, YStack } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { Button } from "../../components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog.tsx"
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../../components/ui/field.tsx"
import { Input } from "../../components/ui/input.tsx"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../components/ui/toggle-group.tsx"
import { useRequirePermission } from "../../core/use-access.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../hooks/use-run-toast.ts"
import { useToast } from "../../hooks/use-toast.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { fontSize, fontWeight } from "../../theme/tokens.ts"
import { RefundBadge } from "../shared/refund-badge.tsx"

/**
 * Native counterpart of web's `PaymentDetailRefunds`: the refunds already
 * recorded (refund/0001), and the buttons that start a refund of goods
 * (amount or chosen items) or of the tip. Which of them are offered, and the
 * limits, come from `deriveRefundAvailability` (refund/0002, 0004, 0005).
 * The sheets are full-screen modals, as the amount needs the keyboard.
 */
export function PaymentRefunds({
  payment,
  excess,
  isPaid,
  defaultMethod,
}: {
  readonly payment: {
    readonly id: PaymentId
    readonly billId: BillId | null
    readonly amount: NonNegativeInteger
    readonly tipAmount: NonNegativeInteger
    readonly currency: FiatCurrency
    readonly cashReceivedAmount: NonNegativeInteger | null
  }
  readonly excess: NonNegativeInteger
  readonly isPaid: boolean
  readonly defaultMethod: RefundMethod
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [sheet, setSheet] = useState<"goods" | "tip" | null>(null)
  const refunds = useEvoluQuery(refundsByPaymentIdQuery(payment.id)).data
  const refundLines = useEvoluQuery(
    refundLinesByPaymentIdQuery(payment.id)
  ).data
  const paymentLines = useEvoluQuery(
    refundablePaymentLinesQuery(payment.id)
  ).data
  const otherClaimedPayments = useEvoluQuery(
    otherClaimedPaymentOfBillQuery(payment.id)
  ).data
  const {
    refundableAmount,
    remainingAmount,
    refundableTipAmount,
    refundableLines,
    canRefund,
    canRefundTip,
  } = deriveRefundAvailability({
    payment,
    excess,
    isPaid,
    refunds,
    refundLines,
    paymentLines,
    hasOtherClaimedPayment: otherClaimedPayments.length > 0,
  })
  const money = (value: NonNegativeInteger) =>
    formatMoney({ value, currency: payment.currency }, locale)

  if (refunds.length === 0 && !canRefund && !canRefundTip) return null

  const refundButtons =
    canRefund || canRefundTip ? (
      <YStack gap={8}>
        {canRefund ? (
          <Button
            variant="outline"
            h={48}
            iconStart={Undo2}
            label={t("paymentDetail.refunds.action")}
            onPress={() => setSheet("goods")}
          />
        ) : null}
        {canRefundTip ? (
          <Button
            variant="outline"
            h={48}
            iconStart={Undo2}
            label={t("paymentDetail.refunds.tipAction", {
              amount: money(refundableTipAmount),
            })}
            onPress={() => setSheet("tip")}
          />
        ) : null}
      </YStack>
    ) : null

  return (
    <>
      {refunds.length === 0 ? (
        refundButtons
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("paymentDetail.refunds.title")}</CardTitle>
            <CardAction>
              <RefundBadge
                summary={{
                  refundedAmount: sumGoodsRefundAmounts(refunds),
                  refundableAmount,
                  currency: payment.currency,
                }}
              />
            </CardAction>
          </CardHeader>
          <CardContent gap={12}>
            <YStack>
              {refunds.map((refund, index) => (
                <YStack
                  key={refund.id}
                  gap={4}
                  py={8}
                  pt={index === 0 ? 0 : 8}
                  borderTopWidth={index === 0 ? 0 : 1}
                  borderColor="border-color"
                >
                  <Text
                    fontSize={fontSize.sm}
                    lineHeight={fontSize.sm}
                    fontWeight={fontWeight.semibold}
                  >
                    {money(refund.amount)}
                  </Text>
                  <Text
                    fontSize={fontSize.xs}
                    lineHeight={fontSize.xs}
                    color="muted-foreground"
                  >
                    {isTipRefund(refund)
                      ? `${t("paymentDetail.refunds.tip")} · `
                      : ""}
                    {t(refundMethodLabelKey[refund.method])} ·{" "}
                    {formatDateTime(new Date(refund.refundedAt), locale)}
                  </Text>
                  {refundLines
                    .filter((line) => line.refundId === refund.id)
                    .map((line) => (
                      <Text
                        key={line.id}
                        fontSize={fontSize.xs}
                        lineHeight={fontSize.xs}
                        color="muted-foreground"
                      >
                        {line.quantity} × {line.name}
                      </Text>
                    ))}
                </YStack>
              ))}
            </YStack>
            {/* EET reversal status and retry come with the EET task. */}
            {refundButtons}
          </CardContent>
        </Card>
      )}
      {sheet === "goods" ? (
        <RefundSheet
          paymentId={payment.id}
          currency={payment.currency}
          remainingAmount={remainingAmount}
          excess={excess}
          refundableLines={refundableLines}
          tipAmount={refundableTipAmount}
          defaultMethod={defaultMethod}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "tip" ? (
        <TipRefundSheet
          paymentId={payment.id}
          currency={payment.currency}
          tipAmount={refundableTipAmount}
          defaultMethod={defaultMethod}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  )
}

/**
 * Web's refund dialogs, on ui/dialog; closing it drops the draft, as
 * cancelling web's dialog does. It cannot be dismissed while a refund is
 * being written.
 */
function Sheet({
  title,
  description,
  pending,
  onClose,
  children,
  footer,
}: {
  readonly title: string
  readonly description: string
  readonly pending: boolean
  readonly onClose: () => void
  readonly children: ReactNode
  readonly footer: ReactNode
}) {
  return (
    <Dialog
      open
      dismissOnOverlayPress={!pending}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <YStack gap={16}>{children}</YStack>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RefundSheet({
  paymentId,
  currency,
  remainingAmount,
  excess,
  refundableLines,
  tipAmount,
  defaultMethod,
  onClose,
}: {
  readonly paymentId: PaymentId
  readonly currency: FiatCurrency
  readonly remainingAmount: NonNegativeInteger
  readonly excess: NonNegativeInteger
  readonly refundableLines: ReadonlyArray<RefundableLine<RefundablePaymentLine>>
  readonly tipAmount: NonNegativeInteger
  readonly defaultMethod: RefundMethod
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const runToast = useRunToast()
  const toast = useToast()
  const { require } = useRequirePermission()
  const { device } = useAtomValue(accountAtom)
  const [mode, setMode] = useState<RefundMode>("amount")
  const [method, setMethod] = useState<RefundMethod>(defaultMethod)
  const [typedAmountText, setTypedAmountText] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<RefundQuantities>({})
  const [pending, setPending] = useState(false)
  const amountText = deriveRefundAmountText({
    typedAmountText,
    remainingAmount,
    excess,
    method,
    currency,
  })
  const { typedAmount, chosenLines, refundAmount } = deriveRefundForm({
    mode,
    amountText,
    quantities,
    refundableLines,
    remainingAmount,
    currency,
  })
  const money = (value: NonNegativeInteger) =>
    formatMoney({ value, currency }, locale)

  const confirm = async () => {
    if (refundAmount === null || pending) return
    // Here rather than where the sheet opens: every refund ends in this
    // confirm (access/0002).
    if (!(await require("refund", "access.action.refund"))) return
    setPending(true)
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
    <Sheet
      title={t("refund.dialog.title")}
      description={t("refund.dialog.description")}
      pending={pending}
      onClose={onClose}
      footer={
        <>
          <Button
            label={
              refundAmount === null
                ? t("refund.dialog.confirmEmpty")
                : t("refund.dialog.confirm", { amount: money(refundAmount) })
            }
            pending={pending}
            disabled={refundAmount === null}
            onPress={() => void confirm()}
          />
          <Button
            variant="outline"
            label={t("refund.dialog.cancel")}
            disabled={pending}
            onPress={onClose}
          />
        </>
      }
    >
      {tipAmount > 0 ? (
        <Text
          fontSize={fontSize.sm}
          lineHeight={fontSize.sm}
          color="muted-foreground"
        >
          {t("refund.dialog.tipHint", { amount: money(tipAmount) })}
        </Text>
      ) : null}
      {refundableLines.length > 0 ? (
        <ToggleGroup
          value={mode}
          onValueChange={setMode}
          variant="outline"
          columns={2}
          disabled={pending}
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
        <Field>
          <FieldLabel>{t("refund.dialog.amount.label")}</FieldLabel>
          <Input
            value={amountText}
            keyboardType="decimal-pad"
            autoComplete="off"
            disabled={pending}
            invalid={typedAmount === null}
            onChangeText={setTypedAmountText}
          />
          <FieldError>
            {typedAmount === null
              ? t("refund.dialog.amount.invalid", {
                  amount: money(remainingAmount),
                })
              : undefined}
          </FieldError>
        </Field>
      ) : (
        <FieldSet>
          <FieldLegend variant="label">
            {t("refund.dialog.items.label")}
          </FieldLegend>
          <YStack>
            {refundableLines.map((refundable, index) => (
              <RefundItemRow
                key={refundable.line.id}
                first={index === 0}
                refundable={refundable}
                quantity={quantities[refundable.line.id] ?? 0}
                disabled={pending}
                onStep={(step) =>
                  setQuantities(
                    stepRefundQuantity(quantities, refundable, step)
                  )
                }
              />
            ))}
          </YStack>
        </FieldSet>
      )}

      <MethodChoice method={method} disabled={pending} onChange={setMethod} />
    </Sheet>
  )
}

function TipRefundSheet({
  paymentId,
  currency,
  tipAmount,
  defaultMethod,
  onClose,
}: {
  readonly paymentId: PaymentId
  readonly currency: FiatCurrency
  readonly tipAmount: NonNegativeInteger
  readonly defaultMethod: RefundMethod
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const runToast = useRunToast()
  const toast = useToast()
  const { require } = useRequirePermission()
  const { device } = useAtomValue(accountAtom)
  const [method, setMethod] = useState<RefundMethod>(defaultMethod)
  const [pending, setPending] = useState(false)
  const formattedTip = formatMoney({ value: tipAmount, currency }, locale)

  const confirm = async () => {
    if (pending) return
    // Web's tip dialog skips this check although access/0002 puts every
    // refund behind `refund`; native asks, the stricter reading.
    if (!(await require("refund", "access.action.refund"))) return
    setPending(true)
    const refunded = await runToast(async (run) => {
      const result = await run(
        refundPaymentTip({ paymentId, method, deviceId: device.id })
      )
      if (!result.ok) return tipRefundErrorKeys[result.error.type]
      return undefined
    })
    setPending(false)
    if (refunded) {
      toast.success(t("refund.tipCreated"))
      onClose()
    }
  }

  return (
    <Sheet
      title={t("refund.tipDialog.title")}
      description={t("refund.tipDialog.description", { amount: formattedTip })}
      pending={pending}
      onClose={onClose}
      footer={
        <>
          <Button
            label={t("refund.dialog.confirm", { amount: formattedTip })}
            pending={pending}
            onPress={() => void confirm()}
          />
          <Button
            variant="outline"
            label={t("refund.dialog.cancel")}
            disabled={pending}
            onPress={onClose}
          />
        </>
      }
    >
      <MethodChoice method={method} disabled={pending} onChange={setMethod} />
    </Sheet>
  )
}

function RefundItemRow({
  first,
  refundable,
  quantity,
  disabled,
  onStep,
}: {
  readonly first: boolean
  readonly refundable: RefundableLine<RefundablePaymentLine>
  readonly quantity: number
  readonly disabled: boolean
  readonly onStep: (step: 1 | -1) => void
}) {
  const { t } = useTranslation()
  const { name } = refundable.line

  return (
    <XStack
      items="center"
      justify="space-between"
      gap={12}
      py={8}
      borderTopWidth={first ? 0 : 1}
      borderColor="border-color"
    >
      <YStack flex={1} minW={0}>
        <Text
          fontSize={fontSize.sm}
          lineHeight={fontSize.sm}
          fontWeight={fontWeight.medium}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          fontSize={fontSize.xs}
          lineHeight={fontSize.xs}
          color="muted-foreground"
        >
          {t("refund.dialog.items.available", {
            quantity: String(refundable.remainingQuantity),
          })}
        </Text>
      </YStack>
      <XStack items="center" gap={8}>
        <Button
          variant="outline"
          size="icon-lg"
          iconStart={Minus}
          accessibilityLabel={t("refund.dialog.items.decrease", { name })}
          disabled={disabled || quantity === 0}
          onPress={() => onStep(-1)}
        />
        <Text
          w={32}
          text="center"
          fontSize={fontSize.sm}
          lineHeight={fontSize.sm}
          fontWeight={fontWeight.semibold}
          fontVariant={["tabular-nums"]}
        >
          {quantity}
        </Text>
        <Button
          variant="outline"
          size="icon-lg"
          iconStart={Plus}
          accessibilityLabel={t("refund.dialog.items.increase", { name })}
          disabled={disabled || quantity >= refundable.remainingQuantity}
          onPress={() => onStep(1)}
        />
      </XStack>
    </XStack>
  )
}

/** Web's `RefundMethodField`: a labelled one-column outline toggle group. */
function MethodChoice({
  method,
  disabled,
  onChange,
}: {
  readonly method: RefundMethod
  readonly disabled: boolean
  readonly onChange: (method: RefundMethod) => void
}) {
  const { t } = useTranslation()
  return (
    <FieldSet>
      <FieldLegend variant="label">
        {t("refund.dialog.method.label")}
      </FieldLegend>
      <ToggleGroup
        value={method}
        onValueChange={onChange}
        variant="outline"
        orientation="vertical"
        disabled={disabled}
      >
        <ToggleGroupItem value="cashRegister" justify="flex-start">
          {t("refund.dialog.method.cashRegister")}
        </ToggleGroupItem>
        <ToggleGroupItem value="outside" justify="flex-start">
          {t("refund.dialog.method.outside")}
        </ToggleGroupItem>
      </ToggleGroup>
    </FieldSet>
  )
}
