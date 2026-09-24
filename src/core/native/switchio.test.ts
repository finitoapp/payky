import { describe, expect, test } from "vitest"

import { interpretSwitchioPaymentResult } from "./switchio.ts"

const approvedResult = JSON.stringify({
  amount: 500,
  appLabel: "Air Bank",
  authCode: "114546",
  brand: "MASTERCARD",
  dateTimeTerminal: "Jul 16, 2020 14:39:37",
  pan: "970348******3910",
  responseCode: "OK",
  responseMessage: "potvrzeno",
  sequenceNumber: "001001614",
  terminalIdAcquirer: "M1TNEXGO01",
  transactionId: "48a3ea7d-b82f-4b42-abbb-5043365e4faa",
})

describe("interpretSwitchioPaymentResult", () => {
  test("accepts an approved transaction and keeps the traceable fields", () => {
    expect(
      interpretSwitchioPaymentResult({
        resultCode: -1,
        transactionResult: approvedResult,
      })
    ).toEqual({
      ok: true,
      value: {
        responseCode: "OK",
        authCode: "114546",
        sequenceNumber: "001001614",
        maskedPan: "970348******3910",
        cardLabel: "Air Bank",
        terminalId: "M1TNEXGO01",
        terminalDateTime: "Jul 16, 2020 14:39:37",
      },
    })
  })

  test("falls back to the card brand when the app label is missing", () => {
    const result = interpretSwitchioPaymentResult({
      resultCode: -1,
      transactionResult: JSON.stringify({
        responseCode: "OK",
        brand: "MASTERCARD",
      }),
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.value.cardLabel).toBe("MASTERCARD")
  })

  test("accepts success without a response code, since the field is optional", () => {
    const result = interpretSwitchioPaymentResult({
      resultCode: -1,
      transactionResult: JSON.stringify({ authCode: "114546" }),
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.value.responseCode).toBe(null)
  })

  test("rejects an explicit non-OK response code even on a success result code", () => {
    const result = interpretSwitchioPaymentResult({
      resultCode: -1,
      transactionResult: JSON.stringify({
        responseCode: "DECLINED",
        responseMessage: "zamitnuto",
      }),
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatchObject({
      type: "SwitchioPaymentFailed",
      responseCode: "DECLINED",
      responseMessage: "zamitnuto",
    })
  })

  test("reports a busy terminal as a failed payment carrying the terminal's message", () => {
    const result = interpretSwitchioPaymentResult({
      resultCode: 2,
      transactionResult: JSON.stringify({
        responseCode: "UNDEFINED",
        responseMessage: "Terminal busy",
      }),
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatchObject({
      type: "SwitchioPaymentFailed",
      resultCode: 2,
      responseMessage: "Terminal busy",
    })
  })

  test("reports a failure result code with no payload as a failed payment", () => {
    const result = interpretSwitchioPaymentResult({
      resultCode: 0,
      transactionResult: null,
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatchObject({
      type: "SwitchioPaymentFailed",
      resultCode: 0,
      responseCode: null,
      responseMessage: null,
    })
  })

  test("never reports an unreadable success payload as declined", () => {
    const result = interpretSwitchioPaymentResult({
      resultCode: -1,
      transactionResult: "not json",
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatchObject({
      type: "SwitchioResultUnreadable",
      rawResult: "not json",
    })
  })

  test("treats a missing success payload as unreadable, not as a decline", () => {
    const result = interpretSwitchioPaymentResult({
      resultCode: -1,
      transactionResult: null,
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatchObject({
      type: "SwitchioResultUnreadable",
    })
  })
})
