import { createIdFromString } from "@evolu/common"

import type { AccountId } from "../account/account-types.ts"
import type { CashuOperationId } from "../cashu/cashu-types.ts"
import type { PaymentAccountKind, PaymentId } from "../payment/payment-types.ts"
import type { RefundId } from "../refund/refund-types.ts"
import type { NonEmptyString } from "../shared/schema.ts"
import type { AccountTransactionId } from "./account-transaction-types.ts"

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

/**
 * The id a Cashu operation's movement is recorded under: one per operation,
 * whichever device or app books it (cashu/0005).
 */
export const deriveCashuAccountTransactionId = (
  cashuOperationId: CashuOperationId
): AccountTransactionId =>
  createIdFromString<"AccountTransaction">(
    `accountTransaction:cashu:${cashuOperationId}`
  )
