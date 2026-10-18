import type { SignalsRow } from "@payky/core/modules/sales-stats/sales-stats-queries"
import { expect, test } from "vitest"
import { signalFigures } from "./signals.tsx"

test("signalFigures fills every signal with zeros, the account currency always present", () => {
  const rows = [
    { signal: "manualIban", currency: "EUR", count: 1, amount: 2_000 },
    { signal: "canceledBill", currency: "CZK", count: 2, amount: 450 },
  ] as unknown as ReadonlyArray<SignalsRow>

  expect(signalFigures(rows, "CZK")).toEqual([
    {
      currency: "CZK",
      signals: [
        { signal: "canceledPayment", count: 0, amount: 0 },
        { signal: "canceledBill", count: 2, amount: 450 },
        { signal: "manualIban", count: 0, amount: 0 },
      ],
    },
    {
      currency: "EUR",
      signals: [
        { signal: "canceledPayment", count: 0, amount: 0 },
        { signal: "canceledBill", count: 0, amount: 0 },
        { signal: "manualIban", count: 1, amount: 2_000 },
      ],
    },
  ])
  expect(signalFigures([], "CZK")).toHaveLength(1)
})
