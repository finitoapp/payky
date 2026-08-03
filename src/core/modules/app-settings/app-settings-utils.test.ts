import { describe, expect, test } from "vitest"

import {
  defaultPaymentMethodOrder,
  parsePaymentMethodOrder,
} from "./app-settings-utils.ts"

describe("parsePaymentMethodOrder", () => {
  test("falls back to the default order for null/undefined", () => {
    expect(parsePaymentMethodOrder(null)).toEqual(defaultPaymentMethodOrder)
    expect(parsePaymentMethodOrder(undefined)).toEqual(
      defaultPaymentMethodOrder
    )
  })

  test("falls back to the default order for invalid JSON", () => {
    expect(parsePaymentMethodOrder("not json")).toEqual(
      defaultPaymentMethodOrder
    )
  })

  test("falls back to the default order when the JSON isn't a method array", () => {
    expect(parsePaymentMethodOrder("{}")).toEqual(defaultPaymentMethodOrder)
    expect(parsePaymentMethodOrder('["unknownMethod"]')).toEqual(
      defaultPaymentMethodOrder
    )
    expect(parsePaymentMethodOrder('["iban","unknownMethod","spark"]')).toEqual(
      defaultPaymentMethodOrder
    )
  })

  test("preserves a valid stored order", () => {
    expect(parsePaymentMethodOrder('["iban","spark","cashRegister"]')).toEqual([
      "iban",
      "spark",
      "cashRegister",
    ])
  })

  test("dedups repeated methods, keeping the first occurrence", () => {
    expect(
      parsePaymentMethodOrder('["iban","iban","spark","cashRegister"]')
    ).toEqual(["iban", "spark", "cashRegister"])
  })

  test("appends methods missing from a partial stored order", () => {
    expect(parsePaymentMethodOrder('["iban"]')).toEqual([
      "iban",
      "cashRegister",
      "spark",
    ])
  })
})
