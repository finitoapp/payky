import { describe, expect, test } from "vitest"
import {
  normalizeBankAccountInputToIban,
  normalizeIbanInput,
} from "./iban-utils.ts"
import { IbanSchema } from "./schema.ts"

describe("IBAN utilities", () => {
  test("normalizes IBAN spacing and case", () => {
    expect(normalizeIbanInput(" cz65 0800 0000 1920 0014 5399 ")).toBe(
      "CZ6508000000192000145399"
    )
  })

  test("normalizes valid IBAN schema output", () => {
    expect(IbanSchema.parse(" cz65 0800 0000 1920 0014 5399 ")).toBe(
      "CZ6508000000192000145399"
    )
  })

  test("validates IBAN checksum and country length", () => {
    expect(IbanSchema.safeParse("CZ6508000000192000145399").success).toBe(true)
    expect(IbanSchema.safeParse("CZ6508000000192000145398").success).toBe(false)
    expect(IbanSchema.safeParse("CZ650800000019200014539999").success).toBe(
      false
    )
  })

  test("converts Czech BBAN without prefix to normalized IBAN", () => {
    expect(normalizeBankAccountInputToIban("123456789/0100")).toEqual({
      success: true,
      iban: "CZ1801000000000123456789",
    })
  })

  test("converts Czech BBAN with prefix to normalized IBAN", () => {
    expect(normalizeBankAccountInputToIban("123-12345678/0100")).toEqual({
      success: true,
      iban: "CZ5701000001230012345678",
    })
  })

  test("rejects BBAN with missing account number or bank code", () => {
    expect(normalizeBankAccountInputToIban("/0100")).toEqual({
      success: false,
    })
    expect(normalizeBankAccountInputToIban("123456789/")).toEqual({
      success: false,
    })
  })
})
