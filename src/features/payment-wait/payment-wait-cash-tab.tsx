import { CheckIcon, LoaderCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import type { CashPaymentTabProps } from "@/features/payment-wait/payment-wait-types.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function CashPaymentTab({
  canMarkCashPaid,
  cashPaymentErrorKey,
  cashPaymentPending,
  cashRegisterAccountId,
  onMarkCashPaid,
}: CashPaymentTabProps) {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col items-center py-4">
      <Button
        type="button"
        size="lg"
        disabled={!canMarkCashPaid || cashPaymentPending}
        onClick={onMarkCashPaid}
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
