import { useMemo } from "react"

import {
  claimedPaymentsByBillIdQuery,
  paymentsByBillIdQuery,
} from "@/core/modules/bill/bill-coverage-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  claimedPaymentIdSet,
  derivePendingPaymentIds,
} from "@/core/modules/bill/bill-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Reactive equivalent of the `isBillLocked` check behind `requireEditableBill`:
 * the ids of the bill's live (pending) payment attempts, which block cart
 * edits regardless of `bill.status`. An empty array means the bill isn't
 * locked. See docs/bill-payment-states.md.
 */
export function usePendingPayments(billId: BillId): ReadonlyArray<PaymentId> {
  const paymentsQuery = useMemo(() => paymentsByBillIdQuery(billId), [billId])
  const claimedQuery = useMemo(
    () => claimedPaymentsByBillIdQuery(billId),
    [billId]
  )
  const { data: payments } = useEvoluQuery(paymentsQuery)
  const { data: claimedPayments } = useEvoluQuery(claimedQuery)

  return useMemo(
    () =>
      derivePendingPaymentIds(
        payments,
        claimedPaymentIdSet(claimedPayments),
        new Date()
      ),
    [payments, claimedPayments]
  )
}
