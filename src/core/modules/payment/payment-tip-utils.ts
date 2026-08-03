import {
  NonNegativeInteger,
  type NonNegativeInteger as NonNegativeIntegerValue,
} from "@/core/modules/shared/schema.ts"

export const calculatePercentageTipAmount = ({
  amount,
  percentage,
}: {
  readonly amount: NonNegativeIntegerValue
  readonly percentage: number
}): NonNegativeIntegerValue =>
  NonNegativeInteger(Math.round((amount * percentage) / 100))

export const calculatePaymentAmounts = ({
  amount,
  tipAmount,
}: {
  readonly amount: NonNegativeIntegerValue
  readonly tipAmount: NonNegativeIntegerValue
}): {
  readonly amount: NonNegativeIntegerValue
  readonly tipAmount: NonNegativeIntegerValue
} => ({
  amount: NonNegativeInteger(amount + tipAmount),
  tipAmount,
})
