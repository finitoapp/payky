import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  countryCodec,
  countryLabelKey,
  OTHER_COUNTRY,
} from "./legal-entity-options.ts"

describe("legal-entity options", () => {
  it("reads an unset country as Other", () => {
    expect(countryLabelKey(null)).toBe("country.other")
    expect(countryLabelKey("CZ")).toBe("country.cz")
  })

  it("maps the explicit Other option to null and back", () => {
    expect(z.safeDecode(countryCodec, OTHER_COUNTRY).data).toBeNull()
    expect(z.safeDecode(countryCodec, "SK").data).toBe("SK")
    expect(z.encode(countryCodec, null)).toBe(OTHER_COUNTRY)
  })
})
