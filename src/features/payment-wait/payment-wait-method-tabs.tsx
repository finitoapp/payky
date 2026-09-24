import type { BankQrFormat } from "@/core/modules/shared/schema.ts"
import { CardPaymentTab } from "@/features/payment-wait/payment-wait-card-tab.tsx"
import { CashPaymentTab } from "@/features/payment-wait/payment-wait-cash-tab.tsx"
import { IbanPaymentTab } from "@/features/payment-wait/payment-wait-iban-tab.tsx"
import { QrPaymentRequest } from "@/features/payment-wait/payment-wait-qr-request.tsx"
import type {
  CardPaymentTabProps,
  CashPaymentTabProps,
  IbanPaidTabProps,
  PaymentMethodOption,
} from "@/features/payment-wait/payment-wait-types.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function PaymentMethodTabContent({
  method,
  canMarkCashPaid,
  cashPaymentErrorKey,
  cashPaymentPending,
  cashRegisterAccountId,
  canPayCard,
  cardPaymentErrorKey,
  cardPaymentPending,
  cardAccountId,
  cardUnresolvedTransactionId,
  canMarkIbanPaid,
  ibanPaymentErrorKey,
  ibanPaymentPending,
  ibanVariableSymbol,
  preparingMessageKey,
  selectedIbanQrFormat,
  onSelectIbanQrFormat,
  onMarkCashPaid,
  onMarkIbanPaid,
  onPayCard,
}: {
  readonly method: PaymentMethodOption
  readonly preparingMessageKey: TranslationKey | null
  readonly selectedIbanQrFormat: BankQrFormat | null
  readonly onSelectIbanQrFormat: (format: BankQrFormat) => void
} & CashPaymentTabProps &
  CardPaymentTabProps &
  IbanPaidTabProps) {
  switch (method.id) {
    case "spark":
      return (
        <QrPaymentRequest
          qrPayload={method.qrPayload}
          preparingMessageKey={preparingMessageKey}
        />
      )
    case "iban":
      return (
        <IbanPaymentTab
          defaultQrFormat={method.defaultQrFormat}
          qrPayload={method.qrPayload}
          qrPayloads={method.qrPayloads}
          iban={method.iban}
          preparingMessageKey={preparingMessageKey}
          selectedQrFormat={selectedIbanQrFormat}
          onSelectQrFormat={onSelectIbanQrFormat}
          canMarkIbanPaid={canMarkIbanPaid}
          ibanPaymentErrorKey={ibanPaymentErrorKey}
          ibanPaymentPending={ibanPaymentPending}
          ibanVariableSymbol={ibanVariableSymbol}
          onMarkIbanPaid={onMarkIbanPaid}
        />
      )
    case "cash":
      return (
        <CashPaymentTab
          canMarkCashPaid={canMarkCashPaid}
          cashPaymentErrorKey={cashPaymentErrorKey}
          cashPaymentPending={cashPaymentPending}
          cashRegisterAccountId={cashRegisterAccountId}
          onMarkCashPaid={onMarkCashPaid}
        />
      )
    case "card":
      return (
        <CardPaymentTab
          canPayCard={canPayCard}
          cardPaymentErrorKey={cardPaymentErrorKey}
          cardPaymentPending={cardPaymentPending}
          cardAccountId={cardAccountId}
          cardUnresolvedTransactionId={cardUnresolvedTransactionId}
          onPayCard={onPayCard}
        />
      )
  }
}
