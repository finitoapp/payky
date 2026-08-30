import { useMemo } from "react"

import {
  claimedPaymentsByBillIdQuery,
  paymentsByBillIdQuery,
} from "@/core/modules/bill/bill-coverage-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  claimedPaymentIdSet,
  hasPendingPayment,
} from "@/core/modules/bill/bill-utils.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Reactive equivalent of the `isBillLocked` check behind `requireEditableBill`:
 * whether the bill currently has a live (pending) payment attempt, which
 * blocks cart edits regardless of `bill.status`. See
 * docs/bill-payment-states.md.
 */
export function useBillLock(billId: BillId): boolean {
  const paymentsQuery = useMemo(() => paymentsByBillIdQuery(billId), [billId])
  const claimedQuery = useMemo(
    () => claimedPaymentsByBillIdQuery(billId),
    [billId]
  )
  const { data: payments } = useEvoluQuery(paymentsQuery)
  const { data: claimedPayments } = useEvoluQuery(claimedQuery)

  return useMemo(
    () =>
      hasPendingPayment(
        payments,
        claimedPaymentIdSet(claimedPayments),
        new Date()
      ),
    [payments, claimedPayments]
  )
}
