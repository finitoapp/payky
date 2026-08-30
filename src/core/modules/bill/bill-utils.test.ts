import { describe, expect, test } from "vitest"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  NonNegativeInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import {
  calculateClaimedSum,
  claimedPaymentIdSet,
  deriveBillCoverage,
  hasPendingPayment,
} from "./bill-utils.ts"

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
          id: "payment-1" as PaymentId,
          amount: NonNegativeInteger(1_000),
          tipAmount: NonNegativeInteger(0),
        },
        {
          id: "payment-2" as PaymentId,
          amount: NonNegativeInteger(2_500),
          tipAmount: NonNegativeInteger(500),
        },
      ])
    ).toBe(3_000)
  })

  test("deduplicates a payment that appears more than once (multiple claims)", () => {
    expect(
      calculateClaimedSum([
        {
          id: "payment-1" as PaymentId,
          amount: NonNegativeInteger(1_000),
          tipAmount: NonNegativeInteger(0),
        },
        {
          id: "payment-1" as PaymentId,
          amount: NonNegativeInteger(1_000),
          tipAmount: NonNegativeInteger(0),
        },
      ])
    ).toBe(1_000)
  })

  test("returns zero for no claimed payments", () => {
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
