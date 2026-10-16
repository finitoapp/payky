import { describe, expect, test } from "vitest"
import {
  classifyPendingWithdrawal,
  computeTotalDebitedSats,
  lightningMaxFeeSats,
  onchainWithdrawAllAmountSats,
  WITHDRAWAL_SEND_TIMEOUT_MS,
  WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS,
} from "./withdraw-utils.ts"

describe("computeTotalDebitedSats", () => {
  test("returns the full available balance when withdrawing all", () => {
    expect(
      computeTotalDebitedSats({
        amountSats: 1000,
        withdrawAll: true,
        availableSats: 5000,
        feeSats: 200,
      })
    ).toBe(5000)
  })

  test("returns the requested amount plus fee for a partial withdrawal", () => {
    expect(
      computeTotalDebitedSats({
        amountSats: 1000,
        withdrawAll: false,
        availableSats: 5000,
        feeSats: 200,
      })
    ).toBe(1200)
  })

  test("adds a zero fee without changing the requested amount", () => {
    expect(
      computeTotalDebitedSats({
        amountSats: 1000,
        withdrawAll: false,
        availableSats: 5000,
        feeSats: 0,
      })
    ).toBe(1000)
  })
})

describe("onchainWithdrawAllAmountSats", () => {
  test("is the balance minus the fee", () => {
    expect(
      onchainWithdrawAllAmountSats({ availableSats: 5000, feeSats: 200 })
    ).toBe(4800)
  })
})

describe("lightningMaxFeeSats", () => {
  test("adds ten percent of the estimate", () => {
    expect(lightningMaxFeeSats(100)).toBe(110)
  })

  test("adds at least three sats", () => {
    expect(lightningMaxFeeSats(0)).toBe(3)
    expect(lightningMaxFeeSats(5)).toBe(8)
  })
})

describe("classifyPendingWithdrawal", () => {
  const createdAt = Date.parse("2026-10-01T10:00:00.000Z")
  const own = { createdAt, createdOnThisDevice: true }
  const other = { createdAt, createdOnThisDevice: false }
  const completed = "TRANSFER_STATUS_COMPLETED"

  test("records a completed SSP payment with a preimage", () => {
    expect(
      classifyPendingWithdrawal({
        withdrawal: own,
        transfer: {
          status: completed,
          type: "PREIMAGE_SWAP",
          userRequest: { status: "PREIMAGE_PROVIDED", paymentPreimage: "aa" },
        },
        now: createdAt,
        isSending: false,
      })
    ).toBe("record")
  })

  test("waits for a completed SSP payment without a preimage", () => {
    expect(
      classifyPendingWithdrawal({
        withdrawal: own,
        transfer: {
          status: completed,
          type: "PREIMAGE_SWAP",
          userRequest: { status: "PENDING" },
        },
        now: createdAt,
        isSending: false,
      })
    ).toBe("wait")
  })

  test("records a completed Spark fallback payment", () => {
    expect(
      classifyPendingWithdrawal({
        withdrawal: own,
        transfer: {
          status: completed,
          type: "TRANSFER",
          userRequest: undefined,
        },
        now: createdAt,
        isSending: false,
      })
    ).toBe("record")
  })

  // The SSP may not have indexed the request yet; the completed swap is no
  // proof the Lightning payment went through (withdraw/0002).
  test("waits for a completed SSP payment whose user request is still missing", () => {
    expect(
      classifyPendingWithdrawal({
        withdrawal: own,
        transfer: {
          status: completed,
          type: "PREIMAGE_SWAP",
          userRequest: undefined,
        },
        now: createdAt,
        isSending: false,
      })
    ).toBe("wait")
  })

  test.each([
    "TRANSFER_STATUS_SENDER_KEY_TWEAKED",
    "TRANSFER_STATUS_RETURNED",
    "TRANSFER_STATUS_EXPIRED",
  ])("waits for a Spark fallback payment in %s", (status) => {
    expect(
      classifyPendingWithdrawal({
        withdrawal: own,
        transfer: { status, type: "TRANSFER", userRequest: undefined },
        now: createdAt,
        isSending: false,
      })
    ).toBe("wait")
  })

  test.each(["LIGHTNING_PAYMENT_FAILED", "USER_SWAP_RETURNED"])(
    "marks %s as returned",
    (status) => {
      expect(
        classifyPendingWithdrawal({
          withdrawal: own,
          transfer: {
            status: "TRANSFER_STATUS_RETURNED",
            type: "PREIMAGE_SWAP",
            userRequest: { status },
          },
          now: createdAt,
          isSending: false,
        })
      ).toBe("returned")
    }
  )

  test.each([
    "TRANSFER_FAILED",
    "PREIMAGE_PROVIDING_FAILED",
    "USER_TRANSFER_VALIDATION_FAILED",
    "PENDING_USER_SWAP_RETURN",
    "FUTURE_VALUE",
  ])("leaves an unverified or unknown status %s alone", (status) => {
    expect(
      classifyPendingWithdrawal({
        withdrawal: own,
        transfer: {
          status: "TRANSFER_STATUS_RETURNED",
          type: "PREIMAGE_SWAP",
          userRequest: { status },
        },
        now: createdAt,
        isSending: false,
      })
    ).toBe("wait")
  })

  test("on the creating device, a missing transfer is not-created only after ten minutes", () => {
    const classify = (now: number) =>
      classifyPendingWithdrawal({
        withdrawal: own,
        transfer: undefined,
        now,
        isSending: false,
      })

    expect(classify(createdAt + WITHDRAWAL_SEND_TIMEOUT_MS - 1)).toBe("wait")
    expect(classify(createdAt + WITHDRAWAL_SEND_TIMEOUT_MS)).toBe("not-created")
  })

  test("on the creating device, a missing transfer waits while it is still sending", () => {
    expect(
      classifyPendingWithdrawal({
        withdrawal: own,
        transfer: undefined,
        now: createdAt + WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS,
        isSending: true,
      })
    ).toBe("wait")
  })

  test("on another device, a missing transfer is not-created only after 24 hours", () => {
    const classify = (now: number) =>
      classifyPendingWithdrawal({
        withdrawal: other,
        transfer: undefined,
        now,
        isSending: false,
      })

    expect(classify(createdAt + WITHDRAWAL_SEND_TIMEOUT_MS)).toBe("wait")
    expect(classify(createdAt + WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS)).toBe(
      "not-created"
    )
  })
})
