import { describe, expect, it } from "vitest"
import { parseTaxRateForm } from "./tax-rate-form.ts"

describe("parseTaxRateForm", () => {
  it("accepts a trimmed name and a decimal rate", () => {
    const result = parseTaxRateForm({ name: "  Food ", rate: "12" })
    expect(result.ok && result.name).toBe("Food")
  })

  it("reports the name before the rate", () => {
    expect(parseTaxRateForm({ name: " ", rate: "x" })).toMatchObject({
      ok: false,
      field: "name",
    })
    expect(parseTaxRateForm({ name: "Food", rate: "x" })).toMatchObject({
      ok: false,
      field: "rate",
      errorKey: "settings.taxRates.rate.invalid",
    })
  })
})
