import { createIdFromString } from "@evolu/common"

import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { PaymentAccountKind } from "@/core/modules/payment/payment-errors.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { RefundId } from "@/core/modules/refund/refund-types.ts"
import type { NonEmptyString } from "@/core/modules/shared/schema.ts"

/**
 * Written out verbatim, not assembled from the kind: they are not symmetrical
 * (the IBAN one carries a `manual` segment, the others do not), and changing
 * any of them would record a second settlement for every payment already
 * confirmed.
 */
const manualPaymentTransactionIdPrefixes = {
  cashRegister: "accountTransaction:cashRegister:payment:",
  iban: "accountTransaction:iban:manual:payment:",
  cardSwitchio: "accountTransaction:cardSwitchio:payment:",
} satisfies Record<PaymentAccountKind, string>

/**
 * The id a hand-confirmed payment's movement is recorded under, so a retried
 * confirmation lands on the row already there instead of counting the money
 * twice.
 */
export const deriveManualPaymentAccountTransactionId = ({
  accountKind,
  paymentId,
  accountId,
}: {
  readonly accountKind: PaymentAccountKind
  readonly paymentId: PaymentId
  readonly accountId: AccountId
}): AccountTransactionId =>
  createIdFromString<"AccountTransaction">(
    `${manualPaymentTransactionIdPrefixes[accountKind]}${paymentId}:${accountId}`
  )

/** The id a cash refund's movement out of the drawer is recorded under. */
export const deriveCashRefundAccountTransactionId = (
  refundId: RefundId
): AccountTransactionId =>
  createIdFromString<"AccountTransaction">(
    `accountTransaction:cashRegister:refund:${refundId}`
  )

/**
 * The id a Spark transfer's movement is recorded under. Exported because a
 * Lightning withdrawal records, before it sends, the id the Spark sync job
 * will later write its movement under.
 */
export const deriveSparkAccountTransactionId = (
  sparkTransferId: NonEmptyString
): AccountTransactionId =>
  createIdFromString<"AccountTransaction">(
    `accountTransaction:spark:${sparkTransferId}`
  )
