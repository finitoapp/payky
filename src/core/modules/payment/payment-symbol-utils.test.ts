import { describe, expect, test } from "vitest"

import { DateStringSchema } from "@/core/modules/shared/schema.ts"
import {
  createSpecificSymbolFromDate,
  createVariableSymbolFromSerialNumber,
} from "./payment-symbol-utils.ts"

describe("createVariableSymbolFromSerialNumber", () => {
  test("is the serial number as digits", () => {
    expect(createVariableSymbolFromSerialNumber(1)).toBe("1")
    expect(createVariableSymbolFromSerialNumber(20_260_001)).toBe("20260001")
  })
})

describe("createSpecificSymbolFromDate", () => {
  test("reduces an ISO date to YYMMDD", () => {
    expect(
      createSpecificSymbolFromDate(DateStringSchema.decode("2026-09-13"))
    ).toBe("260913")
  })

  test("keeps the leading zeros of single-digit months and days", () => {
    // The whole point of the slices: a naive `getMonth() + 1` build would
    // produce "2619" here, which no bank would match back to this payment.
    expect(
      createSpecificSymbolFromDate(DateStringSchema.decode("2026-01-09"))
    ).toBe("260109")
  })

  test("handles a turn-of-century year", () => {
    expect(
      createSpecificSymbolFromDate(DateStringSchema.decode("2000-12-31"))
    ).toBe("001231")
  })
})
