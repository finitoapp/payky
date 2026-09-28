import { CheckIcon, LoaderCircleIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { roundCashAmount } from "@/core/modules/payment/payment-cash-utils.ts"
import {
  decimalAmountToMinorUnits,
  minorUnitsToDecimalString,
} from "@/core/modules/shared/money.ts"
import { Integer, NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import type { CashPaymentTabProps } from "@/features/payment-wait/payment-wait-types.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

export function CashPaymentTab({
  amount,
  currency,
  canMarkCashPaid,
  cashPaymentErrorKey,
  cashPaymentPending,
  cashRegisterAccountId,
  onMarkCashPaid,
}: CashPaymentTabProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const leastReceivedAmount = roundCashAmount({ amount, currency })
  const [editedReceived, setEditedReceived] = useState<string | null>(null)
  const received =
    editedReceived ??
    minorUnitsToDecimalString({ value: leastReceivedAmount, currency })
  const parsedReceived = decimalAmountToMinorUnits({
    currency,
    value: received,
  })
  const receivedAmount =
    parsedReceived === null || parsedReceived < leastReceivedAmount
      ? null
      : NonNegativeInteger(parsedReceived)
  const formatAmount = (value: number) =>
    formatMoney({ value: Integer(value), currency }, locale)

  return (
    <div className="flex w-full flex-col items-center gap-3 py-4">
      <Field data-invalid={receivedAmount === null} className="max-w-72">
        <FieldLabel htmlFor="cash-received">
          {t("paymentWait.cashPaid.received")}
        </FieldLabel>
        <Input
          id="cash-received"
          value={received}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={receivedAmount === null}
          disabled={cashPaymentPending}
          className="h-12 text-center text-lg font-semibold tabular-nums"
          onChange={(event) => {
            setEditedReceived(event.currentTarget.value)
          }}
        />
        {receivedAmount === null ? (
          <FieldError>
            {t("paymentWait.cashPaid.receivedTooLow", {
              amount: formatAmount(leastReceivedAmount),
            })}
          </FieldError>
        ) : receivedAmount === amount ? null : (
          <FieldDescription>
            {t("paymentWait.cashPaid.difference", {
              amount: formatAmount(receivedAmount - amount),
            })}
          </FieldDescription>
        )}
      </Field>
      <Button
        type="button"
        size="lg"
        disabled={
          !canMarkCashPaid || cashPaymentPending || receivedAmount === null
        }
        onClick={() => {
          if (receivedAmount !== null) onMarkCashPaid(receivedAmount)
        }}
        className="h-14 px-8 text-base"
      >
        {cashPaymentPending ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <CheckIcon />
        )}
        {cashPaymentPending
          ? t("paymentWait.cashPaid.pending")
          : t("paymentWait.cashPaid.action")}
      </Button>
      {cashPaymentErrorKey ? (
        <p className="text-sm font-medium text-destructive">
          {t(cashPaymentErrorKey)}
        </p>
      ) : null}
      {cashRegisterAccountId === null || cashRegisterAccountId === undefined ? (
        <p className="max-w-72 text-balance text-sm text-muted-foreground">
          {t("paymentWait.cashPaid.unavailable")}
        </p>
      ) : null}
    </div>
  )
}
