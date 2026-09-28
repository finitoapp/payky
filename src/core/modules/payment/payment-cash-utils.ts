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
