import { useNow } from "@payky/app-shared/use-now"
import {
  claimedTransactionsByBillIdQuery,
  paymentsByBillIdQuery,
} from "@payky/core/modules/bill/bill-coverage-queries"
import type { BillId } from "@payky/core/modules/bill/bill-types"
import {
  claimedPaymentIdSet,
  derivePendingPaymentIds,
} from "@payky/core/modules/bill/bill-utils"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { useMemo } from "react"
import { useOptionalEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Reactive equivalent of the `isBillLocked` check behind `requireEditableBill`:
 * the ids of the bill's live (pending) payment attempts, which block cart
 * edits regardless of `bill.status`. An empty array means the bill isn't
 * locked — including for an `undefined` `billId`, a cart whose bill hasn't
 * been lazily created yet. See docs/bill-payment-states.md.
 *
 * Pendingness is time-dependent through `expiresAt`, and nothing writes a
 * row when a payment expires — so the clock comes from `useNow`, which
 * re-renders when the earliest live payment's invoice runs out. Without it
 * the bill page stayed on `BillLockedMessage` forever after a Lightning
 * invoice expired, even though the server-side `isBillLocked` guard behind
 * `requireEditableBill` (which reads a fresh `date.now()`) would already
 * allow the edit.
 */
export function usePendingPayments(
  billId: BillId | undefined
): ReadonlyArray<PaymentId> {
  const paymentsQuery = useMemo(
    () => (billId === undefined ? null : paymentsByBillIdQuery(billId)),
    [billId]
  )
  // Must stay the same query `isBillLocked` reads, or this lock and the
  // server-side guard disagree — see `claimedPaymentIdSet`.
  const claimedQuery = useMemo(
    () =>
      billId === undefined ? null : claimedTransactionsByBillIdQuery(billId),
    [billId]
  )
  const { data: payments } = useOptionalEvoluQuery(paymentsQuery)
  const { data: claimedTransactions } = useOptionalEvoluQuery(claimedQuery)
  const now = useNow(payments.map((payment) => payment.expiresAt))

  return useMemo(
    () =>
      derivePendingPaymentIds(
        payments,
        claimedPaymentIdSet(claimedTransactions),
        now
      ),
    [payments, claimedTransactions, now]
  )
}
