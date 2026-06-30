import { describe, expect, test } from "vitest"

import {
  defaultPaymentMethodOrder,
  parsePaymentMethodOrder,
} from "@/core/modules/app-settings/app-settings-utils.ts"

describe("parsePaymentMethodOrder", () => {
  test("returns the configured unique methods followed by missing defaults", () => {
    expect(parsePaymentMethodOrder('["iban","spark","iban"]')).toEqual([
      "iban",
      "spark",
      "cashRegister",
    ])
  })

  test("returns the default order for invalid values", () => {
    expect(parsePaymentMethodOrder("not json")).toEqual(
      defaultPaymentMethodOrder
    )
    expect(parsePaymentMethodOrder('["unknown"]')).toEqual(
      defaultPaymentMethodOrder
    )
  })
})
