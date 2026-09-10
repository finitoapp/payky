import { describe, expect, test } from "vitest"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  NonNegativeInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import {
  calculateClaimedSum,
  claimedPaymentIdSet,
  deriveBillCoverage,
  deriveBillHistoryItemSummary,
  deriveBillStatus,
  hasPendingPayment,
} from "./bill-utils.ts"

const now = new Date("2026-06-05T12:00:00.000Z")

describe("deriveBillStatus", () => {
  test("open when nothing else applies", () => {
    expect(
      deriveBillStatus({
        canceledAt: null,
        confirmedClosedAt: null,
        hasActiveClaim: false,
        coverage: "underpaid",
      })
    ).toBe("open")
  })

  test("open when coverage is trivially 'paid' but no claim has ever landed — the fresh-empty-cart guard", () => {
    // A brand-new bill with no line items yet has billTotal === claimedSum
    // === 0, which `deriveBillCoverage` calls "paid" — but with zero
    // payments, that must not read as `closed`. See the doc comment above
    // `deriveBillStatus` and docs/bill-payment-states.md.
    expect(
      deriveBillStatus({
        canceledAt: null,
        confirmedClosedAt: null,
        hasActiveClaim: false,
        coverage: "paid",
      })
    ).toBe("open")
  })

  test("closed when a claim exists and coverage is paid", () => {
    expect(
      deriveBillStatus({
        canceledAt: null,
        confirmedClosedAt: null,
        hasActiveClaim: true,
        coverage: "paid",
      })
    ).toBe("closed")
  })

  test("closed when a claim exists and coverage is overpaid", () => {
    expect(
      deriveBillStatus({
        canceledAt: null,
        confirmedClosedAt: null,
        hasActiveClaim: true,
        coverage: "overpaid",
      })
    ).toBe("closed")
  })

  test("open when a claim exists but coverage is still underpaid — a split/partial payment", () => {
    expect(
      deriveBillStatus({
        canceledAt: null,
        confirmedClosedAt: null,
        hasActiveClaim: true,
        coverage: "underpaid",
      })
    ).toBe("open")
  })

  test("canceled outranks closed-by-coverage — an explicit discard wins the display", () => {
    expect(
      deriveBillStatus({
        canceledAt: TimestampMs(now.getTime() - 1_000),
        confirmedClosedAt: null,
        hasActiveClaim: true,
        coverage: "paid",
      })
    ).toBe("canceled")
  })

  test("canceled when nothing has been claimed either", () => {
    expect(
      deriveBillStatus({
        canceledAt: TimestampMs(now.getTime() - 1_000),
        confirmedClosedAt: null,
        hasActiveClaim: false,
        coverage: "underpaid",
      })
    ).toBe("canceled")
  })

  test("confirmedClosedAt outranks canceled — staff resolving the cancel+funded collision wins the display", () => {
    expect(
      deriveBillStatus({
        canceledAt: TimestampMs(now.getTime() - 1_000),
        confirmedClosedAt: TimestampMs(now.getTime() - 1),
        hasActiveClaim: true,
        coverage: "paid",
      })
    ).toBe("closed")
  })

  test("confirmedClosedAt outranks canceled even for an overpaid bill", () => {
    expect(
      deriveBillStatus({
        canceledAt: TimestampMs(now.getTime() - 1_000),
        confirmedClosedAt: TimestampMs(now.getTime() - 1),
        hasActiveClaim: true,
        coverage: "overpaid",
      })
    ).toBe("closed")
  })
})

describe("deriveBillCoverage", () => {
  test("paid when the claimed sum matches the total exactly", () => {
    expect(
      deriveBillCoverage(NonNegativeInteger(1_000), NonNegativeInteger(1_000))
    ).toBe("paid")
  })

  test("paid when the total is zero and nothing was claimed", () => {
    expect(
      deriveBillCoverage(NonNegativeInteger(0), NonNegativeInteger(0))
    ).toBe("paid")
  })

  test("underpaid when the claimed sum is below the total, including zero", () => {
    expect(
      deriveBillCoverage(NonNegativeInteger(1_000), NonNegativeInteger(0))
    ).toBe("underpaid")
    expect(
      deriveBillCoverage(NonNegativeInteger(1_000), NonNegativeInteger(400))
    ).toBe("underpaid")
  })

  test("overpaid when the claimed sum exceeds the total", () => {
    expect(
      deriveBillCoverage(NonNegativeInteger(1_000), NonNegativeInteger(1_500))
    ).toBe("overpaid")
  })
})

describe("calculateClaimedSum", () => {
  test("sums amount minus tip across payments", () => {
    expect(
      calculateClaimedSum([
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-1" as AccountTransactionId,
          amount: 1_000,
          tipAmount: NonNegativeInteger(0),
        },
        {
          paymentId: "payment-2" as PaymentId,
          accountTransactionId: "tx-2" as AccountTransactionId,
          amount: 2_500,
          tipAmount: NonNegativeInteger(500),
        },
      ])
    ).toBe(3_000)
  })

  test("deduplicates a transaction claimed more than once for the same payment", () => {
    expect(
      calculateClaimedSum([
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-1" as AccountTransactionId,
          amount: 1_000,
          tipAmount: NonNegativeInteger(0),
        },
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-1" as AccountTransactionId,
          amount: 1_000,
          tipAmount: NonNegativeInteger(0),
        },
      ])
    ).toBe(1_000)
  })

  test("sums two distinct transactions claimed for the same payment (a genuine split, or a duplicate-settlement collision)", () => {
    expect(
      calculateClaimedSum([
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-cash" as AccountTransactionId,
          amount: 1_000,
          tipAmount: NonNegativeInteger(0),
        },
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-lightning" as AccountTransactionId,
          amount: 1_000,
          tipAmount: NonNegativeInteger(0),
        },
      ])
    ).toBe(2_000)
  })

  test("subtracts tip only once per payment across its distinct transactions", () => {
    expect(
      calculateClaimedSum([
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-cash" as AccountTransactionId,
          amount: 600,
          tipAmount: NonNegativeInteger(100),
        },
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-lightning" as AccountTransactionId,
          amount: 400,
          tipAmount: NonNegativeInteger(100),
        },
      ])
    ).toBe(900)
  })

  test("floors a payment whose transactions fall short of its tip at zero", () => {
    // A partial, incomplete split: 100 arrived against a payment carrying a
    // 500 tip. Without the floor this payment would contribute -400 and eat
    // into what other payments legitimately covered.
    expect(
      calculateClaimedSum([
        {
          paymentId: "payment-short" as PaymentId,
          accountTransactionId: "tx-partial" as AccountTransactionId,
          amount: 100,
          tipAmount: NonNegativeInteger(500),
        },
        {
          paymentId: "payment-full" as PaymentId,
          accountTransactionId: "tx-full" as AccountTransactionId,
          amount: 1_000,
          tipAmount: NonNegativeInteger(0),
        },
      ])
    ).toBe(1_000)
  })

  test("subtracts the largest tip when a payment's rows disagree about it", () => {
    // Every row of a payment carries that payment's own `tipAmount`, joined
    // from the same `payment` row, so this cannot happen through either
    // current query. Nothing enforces it though, and picking whichever row
    // happened to be read last is a coin flip in one of two directions: too
    // small a tip inflates the claimed sum, and an inflated sum can read a
    // bill as covered while money is still missing. The larger tip is the
    // conservative choice — it can only leave a bill looking *less* covered,
    // which staff notice, rather than closing one that was not paid.
    expect(
      calculateClaimedSum([
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-a" as AccountTransactionId,
          amount: 600,
          tipAmount: NonNegativeInteger(300),
        },
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-b" as AccountTransactionId,
          amount: 400,
          tipAmount: NonNegativeInteger(100),
        },
      ])
    ).toBe(700)
  })

  test("returns zero for no claimed transactions", () => {
    expect(calculateClaimedSum([])).toBe(0)
  })
})

describe("hasPendingPayment", () => {
  const now = new Date("2026-06-05T12:00:00.000Z")

  test("false when there are no payments", () => {
    expect(hasPendingPayment([], new Set(), now)).toBe(false)
  })

  test("true when a payment is neither canceled, claimed, nor expired", () => {
    expect(
      hasPendingPayment(
        [{ id: "payment-1" as PaymentId, canceledAt: null, expiresAt: null }],
        new Set(),
        now
      )
    ).toBe(true)
  })

  test("false when the only payment is canceled", () => {
    expect(
      hasPendingPayment(
        [
          {
            id: "payment-1" as PaymentId,
            canceledAt: TimestampMs(now.getTime() - 1_000),
            expiresAt: null,
          },
        ],
        new Set(),
        now
      )
    ).toBe(false)
  })

  test("false when the only payment is already claimed (paid)", () => {
    expect(
      hasPendingPayment(
        [{ id: "payment-1" as PaymentId, canceledAt: null, expiresAt: null }],
        new Set(["payment-1" as PaymentId]),
        now
      )
    ).toBe(false)
  })

  test("false when the only payment has expired", () => {
    expect(
      hasPendingPayment(
        [
          {
            id: "payment-1" as PaymentId,
            canceledAt: null,
            expiresAt: TimestampMs(now.getTime() - 1),
          },
        ],
        new Set(),
        now
      )
    ).toBe(false)
  })

  test("true when at least one of several payments is still pending", () => {
    expect(
      hasPendingPayment(
        [
          {
            id: "payment-1" as PaymentId,
            canceledAt: TimestampMs(now.getTime() - 1_000),
            expiresAt: null,
          },
          { id: "payment-2" as PaymentId, canceledAt: null, expiresAt: null },
        ],
        new Set(),
        now
      )
    ).toBe(true)
  })
})

describe("deriveBillHistoryItemSummary", () => {
  test("open, no collision, for a fresh bill with nothing claimed", () => {
    expect(
      deriveBillHistoryItemSummary({
        canceledAt: null,
        confirmedClosedAt: null,
        billTotal: NonNegativeInteger(1_000),
        claimedTransactions: [],
      })
    ).toEqual({
      status: "open",
      hasCancellationCollision: false,
      billTotal: 1_000,
      claimedSum: 0,
      coverage: "underpaid",
    })
  })

  test("closed once claims cover the total", () => {
    expect(
      deriveBillHistoryItemSummary({
        canceledAt: null,
        confirmedClosedAt: null,
        billTotal: NonNegativeInteger(1_000),
        claimedTransactions: [
          {
            paymentId: "payment-1" as PaymentId,
            accountTransactionId: "tx-1" as AccountTransactionId,
            amount: 1_000,
            tipAmount: NonNegativeInteger(0),
          },
        ],
      })
    ).toEqual({
      status: "closed",
      hasCancellationCollision: false,
      billTotal: 1_000,
      claimedSum: 1_000,
      coverage: "paid",
    })
  })

  test("flags the canceled+funded collision: canceled but already covered by a claim", () => {
    const summary = deriveBillHistoryItemSummary({
      canceledAt: TimestampMs(now.getTime() - 1_000),
      confirmedClosedAt: null,
      billTotal: NonNegativeInteger(1_000),
      claimedTransactions: [
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-1" as AccountTransactionId,
          amount: 1_000,
          tipAmount: NonNegativeInteger(0),
        },
      ],
    })

    expect(summary.status).toBe("canceled")
    expect(summary.hasCancellationCollision).toBe(true)
  })

  test("no collision flag once staff confirms the bill closed despite the cancellation", () => {
    const summary = deriveBillHistoryItemSummary({
      canceledAt: TimestampMs(now.getTime() - 1_000),
      confirmedClosedAt: TimestampMs(now.getTime() - 1),
      billTotal: NonNegativeInteger(1_000),
      claimedTransactions: [
        {
          paymentId: "payment-1" as PaymentId,
          accountTransactionId: "tx-1" as AccountTransactionId,
          amount: 1_000,
          tipAmount: NonNegativeInteger(0),
        },
      ],
    })

    expect(summary.status).toBe("closed")
    expect(summary.hasCancellationCollision).toBe(false)
  })
})

describe("claimedPaymentIdSet", () => {
  test("returns the set of claimed payment ids, deduplicated", () => {
    const set = claimedPaymentIdSet([
      { id: "payment-1" as PaymentId },
      { id: "payment-2" as PaymentId },
      { id: "payment-1" as PaymentId },
    ])

    expect(set.has("payment-1" as PaymentId)).toBe(true)
    expect(set.has("payment-2" as PaymentId)).toBe(true)
    expect(set.has("payment-3" as PaymentId)).toBe(false)
    expect(set.size).toBe(2)
  })

  test("returns an empty set for no claimed payments", () => {
    expect(claimedPaymentIdSet([]).size).toBe(0)
  })
})
