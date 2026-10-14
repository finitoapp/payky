import type { BankQrFormat } from "@/core/modules/account/account-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { BoltCardReader } from "@/features/payment-wait/payment-wait-bolt-card.tsx"
import { CardPaymentTab } from "@/features/payment-wait/payment-wait-card-tab.tsx"
import { CashPaymentTab } from "@/features/payment-wait/payment-wait-cash-tab.tsx"
import { CashuPaymentTab } from "@/features/payment-wait/payment-wait-cashu-tab.tsx"
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
  boltCardPaymentId,
  amount,
  currency,
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
  cashuPaymentId,
  newCashuQuotePending,
  onNewCashuQuote,
}: {
  readonly method: PaymentMethodOption
  readonly cashuPaymentId: PaymentId
  readonly newCashuQuotePending: boolean
  readonly onNewCashuQuote: () => void
  /** Set while a Bolt Card may pay this payment's Lightning invoice. */
  readonly boltCardPaymentId: PaymentId | null
  readonly preparingMessageKey: TranslationKey | null
  readonly selectedIbanQrFormat: BankQrFormat | null
  readonly onSelectIbanQrFormat: (format: BankQrFormat) => void
} & CashPaymentTabProps &
  CardPaymentTabProps &
  IbanPaidTabProps) {
  switch (method.id) {
    case "spark":
      return (
        <>
          <QrPaymentRequest
            qrPayload={method.qrPayload}
            preparingMessageKey={preparingMessageKey}
          />
          {boltCardPaymentId !== null ? (
            <BoltCardReader paymentId={boltCardPaymentId} />
          ) : null}
        </>
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
          amount={amount}
          currency={currency}
          canMarkCashPaid={canMarkCashPaid}
          cashPaymentErrorKey={cashPaymentErrorKey}
          cashPaymentPending={cashPaymentPending}
          cashRegisterAccountId={cashRegisterAccountId}
          onMarkCashPaid={onMarkCashPaid}
        />
      )
    case "cashu":
      return (
        <CashuPaymentTab
          paymentId={cashuPaymentId}
          qrPayload={method.qrPayload}
          quoteExpired={method.quoteExpired}
          preparingMessageKey={preparingMessageKey}
          newQuotePending={newCashuQuotePending}
          onNewQuote={onNewCashuQuote}
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
