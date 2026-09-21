import { describe, expect, test } from "vitest"

import {
  defaultPaymentMethodOrder,
  parsePaymentMethodOrder,
  resolveDefaultPaymentMethod,
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
    expect(
      parsePaymentMethodOrder('["iban","spark","cashu","cashRegister"]')
    ).toEqual(["iban", "spark", "cashu", "cashRegister"])
    expect(parsePaymentMethodOrder('["iban","spark","cashRegister"]')).toEqual([
      "iban",
      "spark",
      "cashRegister",
      // A method the stored order predates joins at the end.
      "cashu",
    ])
  })

  test("dedups repeated methods, keeping the first occurrence", () => {
    expect(
      parsePaymentMethodOrder('["iban","iban","spark","cashRegister"]')
    ).toEqual(["iban", "spark", "cashRegister", "cashu"])
  })

  test("appends methods missing from a partial stored order", () => {
    expect(parsePaymentMethodOrder('["iban"]')).toEqual([
      "iban",
      "cashRegister",
      "spark",
      "cashu",
    ])
  })
})

describe("resolveDefaultPaymentMethod", () => {
  const order = ["iban", "cashRegister", "spark", "cashu"] as const

  test("keeps the configured method while it is enabled", () => {
    expect(
      resolveDefaultPaymentMethod({
        configured: "spark",
        enabledMethods: new Set(["iban", "spark"]),
        order,
      })
    ).toBe("spark")
  })

  test("a new profile defaults to bank transfer", () => {
    expect(
      resolveDefaultPaymentMethod({
        configured: undefined,
        enabledMethods: new Set(["cashRegister", "iban"]),
        order,
      })
    ).toBe("iban")
  })

  test("hands the default to the first enabled method once the configured one is off", () => {
    expect(
      resolveDefaultPaymentMethod({
        configured: "iban",
        enabledMethods: new Set(["spark", "cashRegister"]),
        order,
      })
    ).toBe("cashRegister")
  })

  test("is null when no method is enabled", () => {
    expect(
      resolveDefaultPaymentMethod({
        configured: "iban",
        enabledMethods: new Set(),
        order,
      })
    ).toBeNull()
  })
})
