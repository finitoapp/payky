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

export type PaymentMethodOption = PaymentMethodOptionBase &
  (
    | {
        /**
         * One bitcoin tab whatever is enabled: Spark, cashu or both. With
         * both, the QR is a BIP-321 uri carrying the mint's Lightning invoice
         * and the Spark invoice; alone, each is shown as its bare invoice.
         */
        readonly id: "bitcoin"
        readonly qrPayload: string | null
        readonly sparkAccountId: AccountId | null
        readonly cashuAccountId: AccountId | null
      }
    | {
        readonly id: "iban"
        readonly qrPayload: string | null
        readonly qrPayloads: ReadonlyArray<BankQrPayload>
        readonly defaultQrFormat: BankQrFormat
        readonly iban: string | null
      }
    | { readonly id: "cash"; readonly qrPayload: null }
  )

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
