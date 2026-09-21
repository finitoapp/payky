import type { ReactNode } from "react"

import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import type { BankQrPayload } from "@/core/modules/payment/payment-iban-qr-payload-utils.ts"
import type { BankQrFormat } from "@/core/modules/shared/schema.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export type PaymentMethodTab = "bitcoin" | "iban" | "cash"

export interface PaymentMethodOptionBase {
  readonly kind: DefaultPaymentMethod
  readonly accountId: AccountId
  readonly label: string
  readonly icon: ReactNode
}

/**
 * A prepared mint quote as the bitcoin tab shows it: the NUT-18 request is
 * built from the amount, mint and quote id once the account's Nostr identity
 * is known, and the invoices ride along in the universal QR next to it.
 */
export interface PreparedCashuRequest {
  readonly amountSats: number
  readonly mintUrl: string
  readonly quoteId: string
  readonly lightningInvoice: string
  readonly sparkInvoice: string | null
}

export interface BitcoinPaymentMethodOption extends PaymentMethodOptionBase {
  /**
   * One bitcoin tab whatever is enabled: Spark, cashu or both. Spark alone is
   * shown as its bare invoice. With cashu the tab offers three QRs — the
   * cashu request, the mint's Lightning invoice and a BIP-321 uri carrying
   * both (plus the Spark invoice when Spark is enabled too) — and
   * `qrPayload` is what it shows before the request can be built.
   */
  readonly id: "bitcoin"
  readonly qrPayload: string | null
  readonly sparkAccountId: AccountId | null
  readonly cashuAccountId: AccountId | null
  readonly cashuRequest: PreparedCashuRequest | null
}

export interface IbanPaymentMethodOption extends PaymentMethodOptionBase {
  readonly id: "iban"
  readonly qrPayload: string | null
  readonly qrPayloads: ReadonlyArray<BankQrPayload>
  readonly defaultQrFormat: BankQrFormat
  readonly iban: string | null
}

export interface CashPaymentMethodOption extends PaymentMethodOptionBase {
  readonly id: "cash"
  readonly qrPayload: null
}

export type PaymentMethodOption =
  | BitcoinPaymentMethodOption
  | IbanPaymentMethodOption
  | CashPaymentMethodOption

export interface CashPaymentTabProps {
  readonly canMarkCashPaid: boolean
  readonly cashPaymentErrorKey: TranslationKey | null
  readonly cashPaymentPending: boolean
  readonly cashRegisterAccountId: AccountId | null | undefined
  readonly onMarkCashPaid: () => void
}

export interface IbanPaidTabProps {
  readonly canMarkIbanPaid: boolean
  readonly ibanPaymentErrorKey: TranslationKey | null
  readonly ibanPaymentPending: boolean
  readonly ibanVariableSymbol: string | null
  readonly onMarkIbanPaid: () => void
}
