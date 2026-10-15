import { describe, expect, test } from "vitest"

import {
  type CashuTokenCandidate,
  matchCashuToken,
} from "@/core/cashu/cashu-token-listener.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"

const candidate = (
  paymentId: string,
  overrides: Partial<CashuTokenCandidate> = {}
): CashuTokenCandidate => ({
  paymentId: paymentId as PaymentId,
  amountSats: 100,
  open: true,
  ...overrides,
})

describe("matchCashuToken", () => {
  test("a payload goes to the open payment its id names, whatever its amount", () => {
    expect(
      matchCashuToken({
        amount: 97,
        requestId: "a",
        candidates: [candidate("a"), candidate("b", { amountSats: 97 })],
      })
    ).toEqual({ type: "payment", paymentId: "a" })
  })

  test("a payload for a payment no longer open is received unassigned", () => {
    expect(
      matchCashuToken({
        amount: 100,
        requestId: "a",
        candidates: [candidate("a", { open: false })],
      })
    ).toEqual({ type: "unassigned" })
  })

  test("a payload naming no known payment is unassigned, not matched by amount", () => {
    expect(
      matchCashuToken({
        amount: 100,
        requestId: "unknown",
        candidates: [candidate("a")],
      })
    ).toEqual({ type: "unassigned" })
  })

  test("a bare token goes to the one open payment of its face amount", () => {
    expect(
      matchCashuToken({
        amount: 100,
        requestId: null,
        candidates: [
          candidate("a"),
          candidate("b", { amountSats: 50 }),
          candidate("d", { open: false }),
        ],
      })
    ).toEqual({ type: "payment", paymentId: "a" })
  })

  test("a bare token two payments fit, or none, is unassigned", () => {
    expect(
      matchCashuToken({
        amount: 100,
        requestId: null,
        candidates: [candidate("a"), candidate("b")],
      })
    ).toEqual({ type: "unassigned" })
    expect(
      matchCashuToken({
        amount: 100,
        requestId: null,
        candidates: [candidate("a", { amountSats: 50 })],
      })
    ).toEqual({ type: "unassigned" })
  })
})
