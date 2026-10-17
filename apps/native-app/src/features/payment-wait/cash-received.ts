import { roundCashAmount } from "@payky/core/modules/payment/payment-cash-utils"
import {
  decimalAmountToMinorUnits,
  minorUnitsToDecimalString,
} from "@payky/core/modules/shared/money"
import {
  type FiatCurrency,
  NonNegativeInteger,
} from "@payky/core/modules/shared/schema"

/**
 * The cash tab's entry, as web's `CashPaymentTab` reads it: the field starts
 * at the cash-rounded charge, and anything unparsable or below that is
 * `receivedAmount: null` (the button stays off and the minimum is shown).
 */
export const readCashReceived = ({
  amount,
  currency,
  edited,
}: {
  readonly amount: NonNegativeInteger
  readonly currency: FiatCurrency
  readonly edited: string | null
}) => {
  const leastReceived = roundCashAmount({ amount, currency })
  const text =
    edited ?? minorUnitsToDecimalString({ value: leastReceived, currency })
  const parsed = decimalAmountToMinorUnits({ currency, value: text })
  return {
    text,
    leastReceived,
    receivedAmount:
      parsed === null || parsed < leastReceived
        ? null
        : NonNegativeInteger(parsed),
  }
}
