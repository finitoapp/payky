import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  bankQrFormatCodec,
  czechBankForDraft,
  fiatBankAccountQrFormatOptions,
  formatBankAccount,
  optionalIbanCodecs,
} from "./bank-account-codecs.ts"

const czechIban = "CZ6508000000192000145399"

describe("optionalIbanCodecs", () => {
  it("normalizes an account number or an IBAN, and reads blank as not set", () => {
    for (const format of ["iban", "bban"] as const) {
      const codec = optionalIbanCodecs[format]
      expect(z.safeDecode(codec, "19-2000145399/0800").data).toBe(czechIban)
      expect(z.safeDecode(codec, ` ${czechIban} `).data).toBe(czechIban)
      expect(z.safeDecode(codec, "   ").data).toBeNull()
    }
  })

  it("rejects an invalid account", () => {
    expect(
      z.safeDecode(optionalIbanCodecs.iban, "CZ6508000000192000145398").success
    ).toBe(false)
    expect(z.safeDecode(optionalIbanCodecs.iban, "nonsense").success).toBe(
      false
    )
  })

  it("encodes in the chosen display format", () => {
    const iban = z.safeDecode(optionalIbanCodecs.iban, czechIban).data ?? null
    expect(z.encode(optionalIbanCodecs.iban, iban)).toBe(czechIban)
    expect(z.encode(optionalIbanCodecs.bban, iban)).toBe("19-2000145399/0800")
    expect(z.encode(optionalIbanCodecs.iban, null)).toBe("")
  })
})

describe("formatBankAccount", () => {
  it("leaves a non-Czech IBAN as it is", () => {
    expect(formatBankAccount.bban("DE89370400440532013000")).toBe(
      "DE89370400440532013000"
    )
  })
})

describe("czechBankForDraft", () => {
  it("is undefined for input that is no Czech account", () => {
    expect(czechBankForDraft("")).toBeUndefined()
    expect(czechBankForDraft("DE89370400440532013000")).toBeUndefined()
  })

  it("names the bank of a Czech account", () => {
    expect(typeof czechBankForDraft(czechIban)).toBe("string")
  })
})

describe("QR format options", () => {
  it("offers every format core knows and decodes each", () => {
    expect(fiatBankAccountQrFormatOptions.length).toBeGreaterThan(0)
    for (const option of fiatBankAccountQrFormatOptions) {
      expect(z.safeDecode(bankQrFormatCodec, option.value).data).toBe(
        option.value
      )
    }
  })
})
