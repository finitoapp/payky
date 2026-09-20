import { describe, expect, test } from "vitest"

import {
  getBankAccountDefaults,
  getBankNameForIban,
} from "@/core/modules/shared/bank-codes.ts"

describe("getBankNameForIban", () => {
  test("names Czech and Slovak banks by the code in the IBAN", () => {
    expect(getBankNameForIban("CZ6508000000192000145399")).toBe(
      "Česká spořitelna"
    )
    expect(getBankNameForIban("cz65 0800 0000 1920 0014 5399")).toBe(
      "Česká spořitelna"
    )
    expect(getBankNameForIban("CZ0020100000000000000000")).toBe("Fio banka")
    expect(getBankNameForIban("SK0009000000000000000000")).toBe(
      "Slovenská sporiteľňa"
    )
  })

  test("returns null for unknown codes and other countries", () => {
    expect(getBankNameForIban("CZ0099990000000000000000")).toBeNull()
    expect(getBankNameForIban("DE89370400440532013000")).toBeNull()
  })
})

describe("getBankAccountDefaults", () => {
  test("derives currency and QR standard from the account's country", () => {
    expect(getBankAccountDefaults("CZ6508000000192000145399")).toEqual({
      currency: "CZK",
      defaultQrFormat: "spayd",
    })
    expect(getBankAccountDefaults("SK0009000000000000000000")).toEqual({
      currency: "EUR",
      defaultQrFormat: "payBySquare1_2_0",
    })
    expect(getBankAccountDefaults("DE89370400440532013000")).toEqual({
      currency: "EUR",
      defaultQrFormat: "spayd",
    })
  })
})
