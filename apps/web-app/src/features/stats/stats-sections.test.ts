import type {
  CategorySalesRow,
  ItemSalesRow,
  KeypadSalesRow,
  SignalsRow,
} from "@payky/core/modules/sales-stats/sales-stats-queries"
import { expect, test } from "vitest"
import { signalFigures } from "./signals.tsx"
import { categoryShares } from "./top-categories.tsx"
import { rankItems } from "./top-items.tsx"

const item = (name: string, quantity: number, amount: number) =>
  ({
    catalogItemId: null,
    latestAt: "2026-10-01T00:00:00.000Z",
    itemId: name,
    name,
    currency: "CZK",
    quantity,
    amount,
  }) as unknown as ItemSalesRow

test("rankItems orders by the chosen metric, name breaking ties", () => {
  const rows = [
    item("Tea", 10, 500),
    item("Cake", 2, 900),
    item("Beer", 2, 500),
  ]
  expect(rankItems(rows, "amount").map((row) => row.name)).toEqual([
    "Cake",
    "Beer",
    "Tea",
  ])
  expect(rankItems(rows, "quantity").map((row) => row.name)).toEqual([
    "Tea",
    "Beer",
    "Cake",
  ])
})

test("categoryShares adds the keypad row, keeps Uncategorized, sorts by amount", () => {
  const categoryRows = [
    {
      categoryId: "drinks",
      categoryName: "Drinks",
      currency: "CZK",
      quantity: 5,
      amount: 300,
    },
    {
      categoryId: null,
      categoryName: null,
      currency: "CZK",
      quantity: 1,
      amount: 100,
    },
    {
      categoryId: "food",
      categoryName: "Food",
      currency: "EUR",
      quantity: 1,
      amount: 999,
    },
  ] as unknown as ReadonlyArray<CategorySalesRow>
  const keypadRows = [
    { currency: "CZK", count: 3, gross: 600 },
    { currency: "EUR", count: 1, gross: 0 },
  ] as unknown as ReadonlyArray<KeypadSalesRow>

  expect(categoryShares({ categoryRows, keypadRows, currency: "CZK" })).toEqual(
    [
      { key: "keypad", name: null, keypad: true, amount: 600, share: 0.6 },
      { key: "drinks", name: "Drinks", keypad: false, amount: 300, share: 0.3 },
      {
        key: "uncategorized",
        name: null,
        keypad: false,
        amount: 100,
        share: 0.1,
      },
    ]
  )
  // A currency's keypad row with nothing sold is left out.
  expect(
    categoryShares({ categoryRows, keypadRows, currency: "EUR" }).map(
      (row) => row.key
    )
  ).toEqual(["food"])
})

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
