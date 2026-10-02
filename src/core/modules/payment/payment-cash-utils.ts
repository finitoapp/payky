import { currencyFractionDigits } from "@/core/modules/shared/money.ts"
import {
  type FiatCurrency,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"

export const roundCashAmount = ({
  amount,
  currency,
}: {
  readonly amount: NonNegativeInteger
  readonly currency: FiatCurrency
}): NonNegativeInteger => {
  if (currency !== "CZK") return amount

  const crown = 10 ** currencyFractionDigits.CZK
  return NonNegativeInteger(Math.floor((amount + crown / 2) / crown) * crown)
}

export const deriveReceivedTipAmount = ({
  amount,
  tipAmount,
  cashReceivedAmount,
  currency,
}: {
  readonly amount: NonNegativeInteger
  readonly tipAmount: NonNegativeInteger
  readonly cashReceivedAmount: NonNegativeInteger | null
  readonly currency: FiatCurrency
}): NonNegativeInteger => {
  if (cashReceivedAmount === null || tipAmount === 0) return tipAmount

  const goodsAmount = roundCashAmount({
    amount: NonNegativeInteger(Math.max(0, amount - tipAmount)),
    currency,
  })
  return NonNegativeInteger(Math.max(0, cashReceivedAmount - goodsAmount))
}
