import { decode as decodePayBySquare, PaymentOptions } from "bysquare/pay"
import { describe, expect, test } from "vitest"

import { SpecificSymbol, VariableSymbol } from "@/core/modules/shared/schema.ts"
import { createBankQrPayloads } from "./payment-iban-qr-payload-utils.ts"

describe("payment IBAN QR payload utils", () => {
  test("creates SPAYD and Pay by square payloads from bank payment data", () => {
    const payloads = createBankQrPayloads({
      beneficiaryName: "Slovak bank account",
      iban: "SK9611000000002918599669",
      amount: 12_900,
      currency: "EUR",
      variableSymbol: VariableSymbol("1"),
      specificSymbol: SpecificSymbol("260605"),
    })

    expect(payloads).toMatchObject([
      {
        format: "spayd",
        payload:
          "SPD*1.0*ACC:SK9611000000002918599669*AM:129.00*CC:EUR*PT:IP*X-VS:1*X-SS:260605",
      },
      {
        format: "payBySquare1_0_0",
        payload: expect.not.stringContaining("SPD*"),
      },
      {
        format: "payBySquare1_2_0",
        payload: expect.not.stringContaining("SPD*"),
      },
    ])

    const payBySquarePayloads = payloads.filter(
      (payload) => payload.format !== "spayd"
    )

    expect(payBySquarePayloads).toHaveLength(2)
    for (const payBySquarePayload of payBySquarePayloads) {
      const decoded = decodePayBySquare(payBySquarePayload.payload)
      const payment = decoded.payments[0]
      expect(payment).toMatchObject({
        type: PaymentOptions.PaymentOrder,
        amount: 129,
        currencyCode: "EUR",
        variableSymbol: "1",
        specificSymbol: "260605",
        beneficiary: {
          name: "Slovak bank account",
        },
        bankAccounts: [
          {
            iban: "SK9611000000002918599669",
          },
        ],
      })
    }

    expect(
      payloads.find((payload) => payload.format === "payBySquare1_0_0")?.payload
    ).not.toBe(
      payloads.find((payload) => payload.format === "payBySquare1_2_0")?.payload
    )
  })
})
