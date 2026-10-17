import { describe, expect, test } from "vitest"
import {
  derivePaymentBillCoverageNotice,
  derivePaymentDetailState,
  type PaymentDetailRow,
  type PaymentReconciliationRow,
} from "./activity-detail.ts"

const now = new Date(2026, 9, 17, 12)

const payment = (overrides: Record<string, unknown> = {}): PaymentDetailRow =>
  ({
    id: "p1",
    amount: 100,
    currency: "CZK",
    tipAmount: 0,
    amountSats: null,
    cashReceivedAmount: null,
    canceledAt: null,
    confirmedPaidAt: null,
    excessAcknowledgedAt: null,
    expiresAt: null,
    ...overrides,
  }) as unknown as PaymentDetailRow

const claim = (
  id: string,
  amount: number,
  kind = "cashRegister"
): PaymentReconciliationRow =>
  ({
    accountTransactionId: id,
    transactionAmount: amount,
    transactionCurrency: "CZK",
    transactionKind: kind,
  }) as unknown as PaymentReconciliationRow

describe("derivePaymentDetailState", () => {
  test("a pending payment has no claims, collisions or methods", () => {
    const state = derivePaymentDetailState({
      payment: payment(),
      reconciliations: [],
      now,
    })
    expect(state.status).toBe("pending")
    expect(state.hasCancellationCollision).toBe(false)
    expect(state.hasExcessSettlementCollision).toBe(false)
    expect(state.paymentMethodKinds).toEqual([])
  })

  test("a canceled payment with a claim is a collision until resolved", () => {
    const state = derivePaymentDetailState({
      payment: payment({ canceledAt: 1 }),
      reconciliations: [claim("a", 100)],
      now,
    })
    expect(state.status).toBe("canceled")
    expect(state.hasCancellationCollision).toBe(true)

    expect(
      derivePaymentDetailState({
        payment: payment({ canceledAt: 1, confirmedPaidAt: 2 }),
        reconciliations: [claim("a", 100)],
        now,
      }).hasCancellationCollision
    ).toBe(false)
  })

  test("two distinct settlements beyond the amount are an excess, until acknowledged", () => {
    const reconciliations = [claim("a", 100), claim("b", 100, "iban")]
    const open = derivePaymentDetailState({
      payment: payment(),
      reconciliations,
      now,
    })
    expect(open.hasExcessSettlementCollision).toBe(true)
    expect(open.excess).toBe(100)
    expect(open.paymentMethodKinds).toEqual(["cashRegister", "iban"])

    expect(
      derivePaymentDetailState({
        payment: payment({ excessAcknowledgedAt: 5 }),
        reconciliations,
        now,
      }).hasExcessSettlementCollision
    ).toBe(false)
  })

  test("one transaction claimed twice counts once", () => {
    const state = derivePaymentDetailState({
      payment: payment(),
      reconciliations: [claim("a", 100), claim("a", 100)],
      now,
    })
    expect(state.excess).toBe(0)
    expect(state.hasExcessSettlementCollision).toBe(false)
  })
})

describe("derivePaymentBillCoverageNotice", () => {
  const base = { lineDiff: null, otherClaimedPaymentCount: 0 }

  test("an unpaid bill is not warned about, a partly paid one is", () => {
    expect(
      derivePaymentBillCoverageNotice({
        ...base,
        coverage: "underpaid",
        claimedSum: 0 as never,
      }).warning
    ).toBeNull()
    expect(
      derivePaymentBillCoverageNotice({
        ...base,
        coverage: "underpaid",
        claimedSum: 40 as never,
      }).warning
    ).toBe("underpaid")
  })

  test("overpaid always warns and a paid bill never does", () => {
    expect(
      derivePaymentBillCoverageNotice({
        ...base,
        coverage: "overpaid",
        claimedSum: 0 as never,
      }).warning
    ).toBe("overpaid")
    expect(
      derivePaymentBillCoverageNotice({
        ...base,
        coverage: "paid",
        claimedSum: 100 as never,
      }).warning
    ).toBeNull()
  })

  test("a changed bill line explains the mismatch before another payment does", () => {
    const diff = { added: [{}], removed: [], changed: [] } as never
    const notice = derivePaymentBillCoverageNotice({
      coverage: "overpaid",
      claimedSum: 100 as never,
      lineDiff: diff,
      otherClaimedPaymentCount: 1,
    })
    expect(notice.reason).toBe("billLinesChanged")
    expect(notice.hasLineDiff).toBe(true)
    expect(
      derivePaymentBillCoverageNotice({
        ...base,
        coverage: "overpaid",
        claimedSum: 100 as never,
        otherClaimedPaymentCount: 1,
      }).reason
    ).toBe("multiplePayments")
  })

  test("an empty diff explains nothing", () => {
    expect(
      derivePaymentBillCoverageNotice({
        coverage: "overpaid",
        claimedSum: 100 as never,
        lineDiff: { added: [], removed: [], changed: [] },
        otherClaimedPaymentCount: 0,
      }).reason
    ).toBeNull()
  })
})
