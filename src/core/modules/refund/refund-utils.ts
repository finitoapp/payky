import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { PaymentLineId } from "@/core/modules/payment-line/payment-line-types.ts"
import type { RefundState } from "@/core/modules/refund/refund-types.ts"
import {
  type FiatCurrency,
  type ItemLineType,
  NonNegativeInteger,
  type PositiveNumber,
} from "@/core/modules/shared/schema.ts"

export const deriveRefundableAmount = ({
  amount,
  cashReceivedAmount,
}: {
  readonly amount: NonNegativeInteger
  readonly cashReceivedAmount: NonNegativeInteger | null
}): NonNegativeInteger => cashReceivedAmount ?? amount

export const sumRefundAmounts = (
  refunds: ReadonlyArray<{ readonly amount: NonNegativeInteger }>
): NonNegativeInteger =>
  NonNegativeInteger(refunds.reduce((sum, { amount }) => sum + amount, 0))

export const deriveRefundState = ({
  refundedAmount,
  refundableAmount,
}: {
  readonly refundedAmount: NonNegativeInteger
  readonly refundableAmount: NonNegativeInteger
}): RefundState => {
  if (refundedAmount === 0) return "none"
  return refundedAmount >= refundableAmount ? "full" : "partial"
}

export interface PaymentRefundSummary {
  readonly refundedAmount: NonNegativeInteger
  readonly refundableAmount: NonNegativeInteger
  readonly currency: FiatCurrency
}

export const summarizeRefundsByPayment = (
  refunds: ReadonlyArray<{
    readonly paymentId: PaymentId
    readonly amount: NonNegativeInteger
    readonly currency: FiatCurrency
    readonly paymentAmount: NonNegativeInteger
    readonly cashReceivedAmount: NonNegativeInteger | null
  }>
): ReadonlyMap<PaymentId, PaymentRefundSummary> => {
  const summaries = new Map<PaymentId, PaymentRefundSummary>()
  for (const refund of refunds) {
    summaries.set(refund.paymentId, {
      refundedAmount: NonNegativeInteger(
        (summaries.get(refund.paymentId)?.refundedAmount ?? 0) + refund.amount
      ),
      refundableAmount: deriveRefundableAmount({
        amount: refund.paymentAmount,
        cashReceivedAmount: refund.cashReceivedAmount,
      }),
      currency: refund.currency,
    })
  }
  return summaries
}

const roundQuantity = (quantity: number) => Math.round(quantity * 1e6) / 1e6

export interface RefundableLine<TLine> {
  readonly line: TLine
  readonly remainingQuantity: number
  readonly remainingAmount: NonNegativeInteger
}

export const deriveRefundableLines = <
  TLine extends {
    readonly id: PaymentLineId
    readonly type: ItemLineType
    readonly quantity: PositiveNumber
    readonly totalAmount: NonNegativeInteger
  },
>(
  lines: ReadonlyArray<TLine>,
  refundLines: ReadonlyArray<{
    readonly paymentLineId: PaymentLineId
    readonly quantity: PositiveNumber
    readonly amount: NonNegativeInteger
  }>
): ReadonlyArray<RefundableLine<TLine>> =>
  lines.flatMap((line) => {
    if (line.type === "tip") return []

    const refunded = refundLines.filter(
      ({ paymentLineId }) => paymentLineId === line.id
    )
    const remainingQuantity = roundQuantity(
      line.quantity - refunded.reduce((sum, { quantity }) => sum + quantity, 0)
    )
    if (remainingQuantity <= 0) return []

    return [
      {
        line,
        remainingQuantity,
        remainingAmount: NonNegativeInteger(
          Math.max(0, line.totalAmount - sumRefundAmounts(refunded))
        ),
      },
    ]
  })

export const calculateRefundLineAmount = (
  {
    line,
    remainingQuantity,
    remainingAmount,
  }: RefundableLine<{
    readonly quantity: PositiveNumber
    readonly totalAmount: NonNegativeInteger
  }>,
  quantity: number
): NonNegativeInteger =>
  quantity >= remainingQuantity
    ? remainingAmount
    : NonNegativeInteger(
        Math.min(
          remainingAmount,
          Math.round((line.totalAmount * quantity) / line.quantity)
        )
      )
