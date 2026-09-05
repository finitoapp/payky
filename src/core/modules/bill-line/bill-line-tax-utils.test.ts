import { createIdFromString } from "@evolu/common"
import { describe, expect, test } from "vitest"
import {
  NonEmptyString255,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import type { TaxRateId } from "@/core/modules/tax-rate/tax-rate-types.ts"
import { TaxRatePercentage } from "@/core/modules/tax-rate/tax-rate-types.ts"
import { calculateTaxRecap } from "./bill-line-tax-utils.ts"

const standardRateId = createIdFromString<"TaxRate">("standard") as TaxRateId
const reducedRateId = createIdFromString<"TaxRate">("reduced") as TaxRateId
const unknownRateId = createIdFromString<"TaxRate">("unknown") as TaxRateId

const taxRates = [
  {
    id: standardRateId,
    name: NonEmptyString255("Standard rate"),
    rate: TaxRatePercentage(2100),
  },
  {
    id: reducedRateId,
    name: NonEmptyString255("Reduced rate"),
    rate: TaxRatePercentage(1200),
  },
]

describe("calculateTaxRecap", () => {
  test("splits and groups lines by tax rate", () => {
    const rows = calculateTaxRecap(
      [
        { taxRateId: standardRateId, totalAmount: NonNegativeInteger(12_100) },
        { taxRateId: reducedRateId, totalAmount: NonNegativeInteger(5_600) },
      ],
      taxRates
    )

    expect(rows).toEqual([
      {
        taxRateId: standardRateId,
        name: "Standard rate",
        ratePercentage: 2100,
        baseAmount: 10_000,
        taxAmount: 2_100,
        grossAmount: 12_100,
      },
      {
        taxRateId: reducedRateId,
        name: "Reduced rate",
        ratePercentage: 1200,
        baseAmount: 5_000,
        taxAmount: 600,
        grossAmount: 5_600,
      },
    ])
  })

  test("sums multiple lines with the same tax rate", () => {
    const rows = calculateTaxRecap(
      [
        { taxRateId: standardRateId, totalAmount: NonNegativeInteger(12_100) },
        { taxRateId: standardRateId, totalAmount: NonNegativeInteger(1_210) },
      ],
      taxRates
    )

    expect(rows).toEqual([
      {
        taxRateId: standardRateId,
        name: "Standard rate",
        ratePercentage: 2100,
        baseAmount: 11_000,
        taxAmount: 2_310,
        grossAmount: 13_310,
      },
    ])
  })

  test("groups lines with no tax rate into a nameless row", () => {
    const rows = calculateTaxRecap(
      [{ taxRateId: null, totalAmount: NonNegativeInteger(500) }],
      taxRates
    )

    expect(rows).toEqual([
      {
        taxRateId: null,
        name: null,
        ratePercentage: null,
        baseAmount: 500,
        taxAmount: 0,
        grossAmount: 500,
      },
    ])
  })

  test("orders rows by taxRates' own order, with the no-tax group last", () => {
    const rows = calculateTaxRecap(
      [
        { taxRateId: null, totalAmount: NonNegativeInteger(100) },
        { taxRateId: reducedRateId, totalAmount: NonNegativeInteger(1_120) },
        { taxRateId: standardRateId, totalAmount: NonNegativeInteger(1_210) },
      ],
      taxRates
    )

    expect(rows.map((row) => row.taxRateId)).toEqual([
      standardRateId,
      reducedRateId,
      null,
    ])
  })

  test("excludes lines whose tax rate isn't in taxRates (not yet synced)", () => {
    const rows = calculateTaxRecap(
      [
        { taxRateId: unknownRateId, totalAmount: NonNegativeInteger(200) },
        { taxRateId: standardRateId, totalAmount: NonNegativeInteger(1_210) },
      ],
      taxRates
    )

    expect(rows).toEqual([
      {
        taxRateId: standardRateId,
        name: "Standard rate",
        ratePercentage: 2100,
        baseAmount: 1_000,
        taxAmount: 210,
        grossAmount: 1_210,
      },
    ])
  })

  test("returns nothing for an empty bill", () => {
    expect(calculateTaxRecap([], taxRates)).toEqual([])
  })
})
