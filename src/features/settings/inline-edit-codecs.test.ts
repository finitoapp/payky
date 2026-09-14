import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  NonEmptyString255,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { createPriceCodec } from "@/features/settings/items/catalog-item-form-schema.ts"
import {
  NO_OPTION,
  optionalIdCodec,
  optionalTextCodec,
  requiredTextCodec,
} from "./inline-edit-codecs.ts"

/**
 * `z.encode` runs the codec's output schema backwards, which throws on a
 * `.transform()`. Every codec here is therefore checked in both directions,
 * not only the decode one the save path exercises.
 */
describe("requiredTextCodec", () => {
  it("decodes trimmed text and rejects blanks", () => {
    expect(z.safeDecode(requiredTextCodec, "  Table 5 ").data).toBe("Table 5")
    expect(z.safeDecode(requiredTextCodec, "   ").success).toBe(false)
    expect(z.safeDecode(requiredTextCodec, "").success).toBe(false)
  })

  it("encodes back to the text the input shows", () => {
    expect(z.encode(requiredTextCodec, NonEmptyString255("Table 5"))).toBe(
      "Table 5"
    )
  })
})

describe("optionalTextCodec", () => {
  it("treats blank as not set", () => {
    expect(z.safeDecode(optionalTextCodec, "   ").data).toBeNull()
    expect(z.safeDecode(optionalTextCodec, " SKU-1 ").data).toBe("SKU-1")
  })

  it("encodes not set back to an empty input", () => {
    expect(z.encode(optionalTextCodec, null)).toBe("")
    expect(z.encode(optionalTextCodec, NonEmptyString255("SKU-1"))).toBe(
      "SKU-1"
    )
  })
})

describe("optionalIdCodec", () => {
  const codec = optionalIdCodec<"abc">()

  it("maps the no-option value to null and back", () => {
    expect(z.safeDecode(codec, NO_OPTION).data).toBeNull()
    expect(z.safeDecode(codec, "abc").data).toBe("abc")
    expect(z.encode(codec, null)).toBe(NO_OPTION)
    expect(z.encode(codec, "abc")).toBe("abc")
  })
})

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
