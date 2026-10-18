import { NonNegativeInteger } from "@payky/core/modules/shared/schema"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createPriceCodec } from "@/features/shared/catalog-item-form-schema.ts"

describe("createPriceCodec", () => {
  const codec = createPriceCodec("CZK")

  it("decodes a decimal amount into minor units", () => {
    expect(z.safeDecode(codec, "12.50").data).toBe(1250)
    expect(z.safeDecode(codec, "12,50").data).toBe(1250)
    expect(z.safeDecode(codec, "1").data).toBe(100)
  })

  it("rejects an amount the currency cannot hold", () => {
    expect(z.safeDecode(codec, "12.505").success).toBe(false)
    expect(z.safeDecode(codec, "abc").success).toBe(false)
    expect(z.safeDecode(codec, "-1").success).toBe(false)
    expect(z.safeDecode(codec, "").success).toBe(false)
    // `decimalAmountToMinorUnits` refuses a zero price outright.
    expect(z.safeDecode(codec, "0").success).toBe(false)
  })

  it("encodes minor units back to the decimal the input shows", () => {
    expect(z.encode(codec, NonNegativeInteger(1250))).toBe("12.5")
    expect(z.encode(codec, NonNegativeInteger(100))).toBe("1")
  })
})
