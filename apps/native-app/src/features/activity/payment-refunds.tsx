import { refundBadgeLabel } from "@payky/app-shared/activity-history"
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
import { type ReactNode, useState } from "react"
import { Modal, Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { Field } from "../../components/field.tsx"
import { Screen } from "../../components/screen.tsx"
import { Button } from "../../components/ui/button.tsx"
import { useRequirePermission } from "../../core/use-access.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../hooks/use-run-toast.ts"
import { useToast } from "../../hooks/use-toast.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { Card } from "./detail-parts.tsx"

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

  const badge = refundBadgeLabel(
    {
      refundedAmount: sumGoodsRefundAmounts(refunds),
      refundableAmount,
      currency: payment.currency,
    },
    t,
    locale
  )

  return (
    <Card
      title={t("paymentDetail.refunds.title")}
      badge={
        badge === null ? undefined : (
          <Text fontSize={12} color="warning">
            {badge}
          </Text>
        )
      }
    >
      {refunds.map((refund) => (
        <YStack key={refund.id} gap="0.5">
          <Text fontWeight="600">{money(refund.amount)}</Text>
          <Text fontSize={12} color="muted-foreground">
            {isTipRefund(refund) ? `${t("paymentDetail.refunds.tip")} · ` : ""}
            {t(refundMethodLabelKey[refund.method])} ·{" "}
            {formatDateTime(new Date(refund.refundedAt), locale)}
          </Text>
          {refundLines
            .filter((line) => line.refundId === refund.id)
            .map((line) => (
              <Text key={line.id} fontSize={12} color="muted-foreground">
                {line.quantity} × {line.name}
              </Text>
            ))}
        </YStack>
      ))}
      {/* EET reversal status and retry come with the EET task. */}
      {canRefund ? (
        <Button
          size="lg"
          variant="outline"
          label={t("paymentDetail.refunds.action")}
          onPress={() => setSheet("goods")}
        />
      ) : null}
      {canRefundTip ? (
        <Button
          size="lg"
          variant="outline"
          label={t("paymentDetail.refunds.tipAction", {
            amount: money(refundableTipAmount),
          })}
          onPress={() => setSheet("tip")}
        />
      ) : null}
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
    </Card>
  )
}

/** A full-screen sheet; closing it drops the draft, as cancelling web's dialog does. */
function Sheet({
  title,
  description,
  onClose,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly onClose: () => void
  readonly children: ReactNode
}) {
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Screen>
        <Text fontSize={24} fontWeight="600" accessibilityRole="header">
          {title}
        </Text>
        <Text color="muted-foreground">{description}</Text>
        {children}
      </Screen>
    </Modal>
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
      onClose={onClose}
    >
      {tipAmount > 0 ? (
        <Text color="muted-foreground">
          {t("refund.dialog.tipHint", { amount: money(tipAmount) })}
        </Text>
      ) : null}
      {refundableLines.length > 0 ? (
        <Choice
          label={t("refund.dialog.mode.label")}
          value={mode}
          disabled={pending}
          options={[
            { value: "amount", label: t("refund.dialog.mode.amount") },
            { value: "items", label: t("refund.dialog.mode.items") },
          ]}
          onChange={setMode}
        />
      ) : null}

      {mode === "amount" ? (
        <Field
          label={t("refund.dialog.amount.label")}
          value={amountText}
          keyboardType="decimal-pad"
          autoComplete="off"
          disabled={pending}
          error={
            typedAmount === null
              ? t("refund.dialog.amount.invalid", {
                  amount: money(remainingAmount),
                })
              : undefined
          }
          onChangeText={setTypedAmountText}
        />
      ) : (
        <YStack gap="2">
          <Text fontSize="sm" fontWeight="600">
            {t("refund.dialog.items.label")}
          </Text>
          {refundableLines.map((refundable) => (
            <RefundItemRow
              key={refundable.line.id}
              refundable={refundable}
              quantity={quantities[refundable.line.id] ?? 0}
              disabled={pending}
              onStep={(step) =>
                setQuantities(stepRefundQuantity(quantities, refundable, step))
              }
            />
          ))}
        </YStack>
      )}

      <MethodChoice method={method} disabled={pending} onChange={setMethod} />

      <YStack gap="2">
        <Button
          size="lg"
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
          size="lg"
          variant="outline"
          label={t("refund.dialog.cancel")}
          disabled={pending}
          onPress={onClose}
        />
      </YStack>
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
      onClose={onClose}
    >
      <MethodChoice method={method} disabled={pending} onChange={setMethod} />
      <YStack gap="2">
        <Button
          size="lg"
          label={t("refund.dialog.confirm", { amount: formattedTip })}
          pending={pending}
          onPress={() => void confirm()}
        />
        <Button
          size="lg"
          variant="outline"
          label={t("refund.dialog.cancel")}
          disabled={pending}
          onPress={onClose}
        />
      </YStack>
    </Sheet>
  )
}

function RefundItemRow({
  refundable,
  quantity,
  disabled,
  onStep,
}: {
  readonly refundable: RefundableLine<RefundablePaymentLine>
  readonly quantity: number
  readonly disabled: boolean
  readonly onStep: (step: 1 | -1) => void
}) {
  const { t } = useTranslation()
  const { name } = refundable.line

  return (
    <XStack gap="2" items="center">
      <YStack flex={1}>
        <Text fontWeight="600" numberOfLines={1}>
          {name}
        </Text>
        <Text fontSize={12} color="muted-foreground">
          {t("refund.dialog.items.available", {
            quantity: String(refundable.remainingQuantity),
          })}
        </Text>
      </YStack>
      <StepButton
        label={t("refund.dialog.items.decrease", { name })}
        symbol="−"
        disabled={disabled || quantity === 0}
        onPress={() => onStep(-1)}
      />
      <Text minW={28} text="center" fontWeight="600">
        {quantity}
      </Text>
      <StepButton
        label={t("refund.dialog.items.increase", { name })}
        symbol="+"
        disabled={disabled || quantity >= refundable.remainingQuantity}
        onPress={() => onStep(1)}
      />
    </XStack>
  )
}

function StepButton({
  label,
  symbol,
  disabled,
  onPress,
}: {
  readonly label: string
  readonly symbol: string
  readonly disabled: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text fontSize={20}>{symbol}</Text>
    </Pressable>
  )
}

/** A labelled single choice; the chosen option is the filled button. */
function Choice<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  readonly label: string
  readonly value: T
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>
  readonly disabled: boolean
  readonly onChange: (value: T) => void
}) {
  return (
    <YStack gap="1.5">
      <Text fontSize="sm" fontWeight="600">
        {label}
      </Text>
      <YStack gap="2">
        {options.map((option) => (
          <Button
            size="lg"
            key={option.value}
            variant={option.value === value ? "default" : "outline"}
            label={option.label}
            disabled={disabled}
            onPress={() => onChange(option.value)}
          />
        ))}
      </YStack>
    </YStack>
  )
}

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
    <Choice
      label={t("refund.dialog.method.label")}
      value={method}
      disabled={disabled}
      options={[
        {
          value: "cashRegister",
          label: t("refund.dialog.method.cashRegister"),
        },
        { value: "outside", label: t("refund.dialog.method.outside") },
      ]}
      onChange={onChange}
    />
  )
}
