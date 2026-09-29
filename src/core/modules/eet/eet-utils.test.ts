import { describe, expect, test } from "vitest"

import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  type EetDateTime,
  EetEstablishmentIdSchema,
} from "@/core/modules/eet/eet-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { ReconciliationClaimId } from "@/core/modules/reconciliation-claim/reconciliation-claim-types.ts"
import {
  NonNegativeInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import {
  bytesToEetBase64,
  createEetExtraSaleId,
  createEetSaleId,
  deriveDueEetExtraSale,
  deriveEetCertificateExpiry,
  deriveEetSaleStatus,
  type EetExtraClaim,
  eetBase64ToBytes,
  formatEetDateTime,
  getEetRecordingDeviceWaitEndsAt,
  getEetReversalStartsAt,
  getEetUnsupportedReason,
  hasLostEetAnswer,
  isEetFirstSending,
  isEetSaleOverdue,
  isEetSandboxActive,
  parseEetWarnings,
  resolveEetEnvironment,
  toEetCashRegisterId,
} from "./eet-utils.ts"

const saleAt = "2027-01-09T16:45:36+01:00" as EetDateTime

describe("EetEstablishmentIdSchema", () => {
  test("accepts a whole number without leading zeros", () => {
    expect(EetEstablishmentIdSchema.safeParse("24").success).toBe(true)
    expect(EetEstablishmentIdSchema.safeParse("999999999").success).toBe(true)
  })

  test.each(["024", "A24", "0", "1000000000", "", " 24"])(
    "refuses %j",
    (value) => {
      expect(EetEstablishmentIdSchema.safeParse(value).success).toBe(false)
    }
  )
})

describe("createEetSaleId", () => {
  test("derives the same id for the same payment on every device", () => {
    const paymentId = "p-aaaaaaaaaaaaaaaaaaaa" as PaymentId

    expect(createEetSaleId(paymentId)).toBe(createEetSaleId(paymentId))
    expect(createEetSaleId(paymentId)).not.toBe(
      createEetSaleId("p-bbbbbbbbbbbbbbbbbbbb" as PaymentId)
    )
  })
})

describe("toEetCashRegisterId", () => {
  test("takes the first 20 characters of the device id", () => {
    expect(toEetCashRegisterId("abcdefghij_klmnop-qrstu" as DeviceId)).toBe(
      "abcdefghij_klmnop-qr"
    )
  })
})

describe("formatEetDateTime", () => {
  test("writes the local time with its offset", () => {
    expect(formatEetDateTime(new Date("2027-01-09T15:45:36.900Z"))).toBe(
      "2027-01-09T16:45:36+01:00"
    )
    expect(formatEetDateTime(new Date("2027-07-09T15:45:36Z"))).toBe(
      "2027-07-09T17:45:36+02:00"
    )
  })
})

describe("bytesToEetBase64", () => {
  test("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])

    expect(eetBase64ToBytes(bytesToEetBase64(bytes))).toEqual(bytes)
  })
})

describe("getEetUnsupportedReason", () => {
  test("accepts a CZK amount", () => {
    expect(
      getEetUnsupportedReason({
        amount: NonNegativeInteger(25_000),
        currency: "CZK",
      })
    ).toBeNull()
  })

  test("refuses another currency", () => {
    expect(
      getEetUnsupportedReason({
        amount: NonNegativeInteger(25_000),
        currency: "EUR",
      })
    ).toBe("currency")
  })

  test("refuses an amount EET cannot carry", () => {
    expect(
      getEetUnsupportedReason({
        amount: NonNegativeInteger(10_000_000_000),
        currency: "CZK",
      })
    ).toBe("amount")
  })
})

describe("resolveEetEnvironment", () => {
  test("defaults to production when it is available", () => {
    expect(
      resolveEetEnvironment({
        environment: null,
        isTestCertificate: false,
        isProductionAvailable: true,
      })
    ).toBe("production")
  })

  test("keeps the chosen playground", () => {
    expect(
      resolveEetEnvironment({
        environment: "playground",
        isTestCertificate: false,
        isProductionAvailable: true,
      })
    ).toBe("playground")
  })

  test("falls back to the playground without a production endpoint", () => {
    expect(
      resolveEetEnvironment({
        environment: "production",
        isTestCertificate: false,
        isProductionAvailable: false,
      })
    ).toBe("playground")
  })

  test("stays on the playground with a test certificate", () => {
    expect(
      resolveEetEnvironment({
        environment: "production",
        isTestCertificate: true,
        isProductionAvailable: true,
      })
    ).toBe("playground")
  })
})

describe("deriveEetSaleStatus", () => {
  test.each([
    {
      name: "a production confirmation",
      input: {
        confirmation: { isTest: false },
        environment: "production" as const,
        unsupportedReason: null,
        lastAttemptResult: null,
      },
      status: "confirmed",
    },
    {
      name: "a playground confirmation",
      input: {
        confirmation: { isTest: true },
        environment: "playground" as const,
        unsupportedReason: null,
        lastAttemptResult: null,
      },
      status: "testConfirmed",
    },
    {
      name: "a confirmation after a rejected attempt",
      input: {
        confirmation: { isTest: false },
        environment: "production" as const,
        unsupportedReason: null,
        lastAttemptResult: "rejected" as const,
      },
      status: "confirmed",
    },
    {
      name: "an unsupported currency",
      input: {
        confirmation: null,
        environment: "production" as const,
        unsupportedReason: "currency" as const,
        lastAttemptResult: null,
      },
      status: "unsupported",
    },
    {
      name: "a rejected attempt",
      input: {
        confirmation: null,
        environment: "production" as const,
        unsupportedReason: null,
        lastAttemptResult: "rejected" as const,
      },
      status: "rejected",
    },
    {
      name: "a retryable attempt",
      input: {
        confirmation: null,
        environment: "production" as const,
        unsupportedReason: null,
        lastAttemptResult: "retry" as const,
      },
      status: "pending",
    },
    {
      name: "no attempt yet",
      input: {
        confirmation: null,
        environment: "production" as const,
        unsupportedReason: null,
        lastAttemptResult: null,
      },
      status: "pending",
    },
  ])("derives $status for $name", ({ input, status }) => {
    expect(deriveEetSaleStatus(input)).toBe(status)
  })
})

describe("isEetSaleOverdue", () => {
  test("flags a pending sale 49 hours after the time of sale", () => {
    expect(
      isEetSaleOverdue({
        status: "pending",
        saleAt,
        now: new Date("2027-01-11T16:45:37+01:00"),
      })
    ).toBe(true)
    expect(
      isEetSaleOverdue({
        status: "pending",
        saleAt,
        now: new Date("2027-01-11T17:45:36+01:00"),
      })
    ).toBe(true)
  })

  test("does not flag a pending sale within 48 hours", () => {
    expect(
      isEetSaleOverdue({
        status: "pending",
        saleAt,
        now: new Date("2027-01-11T16:45:36+01:00"),
      })
    ).toBe(false)
  })

  test("flags a rejected sale and never a confirmed one", () => {
    const now = new Date("2027-01-12T00:00:00+01:00")

    expect(isEetSaleOverdue({ status: "rejected", saleAt, now })).toBe(true)
    expect(isEetSaleOverdue({ status: "confirmed", saleAt, now })).toBe(false)
    expect(isEetSaleOverdue({ status: "testConfirmed", saleAt, now })).toBe(
      false
    )
    expect(isEetSaleOverdue({ status: "unsupported", saleAt, now })).toBe(false)
  })
})

const tablet = "tablet-device-id-0001" as DeviceId
const phone = "phone-device-id-00001" as DeviceId
const startsAt = TimestampMs(Date.parse("2027-01-09T15:45:36.000Z"))
const minutesAfterStart = (minutes: number) =>
  new Date(startsAt + minutes * 60 * 1000)
const noAttempt: {
  readonly attemptStartedAt: TimestampMs | null
  readonly lastAttemptAt: TimestampMs | null
} = { attemptStartedAt: null, lastAttemptAt: null }

describe("isEetFirstSending", () => {
  test.each([
    ["the recording device right after the start", tablet, noAttempt, 0, true],
    ["the recording device at 5 minutes", tablet, noAttempt, 5, true],
    ["the recording device after 5 minutes", tablet, noAttempt, 6, false],
    ["another device", phone, noAttempt, 0, false],
    [
      "an attempt already started",
      tablet,
      { attemptStartedAt: startsAt, lastAttemptAt: null },
      1,
      false,
    ],
    [
      "an attempt from before attempts were recorded up front",
      tablet,
      { attemptStartedAt: null, lastAttemptAt: startsAt },
      1,
      false,
    ],
  ])("is %s: %s", (_case, deviceId, attempts, minutes, expected) => {
    expect(
      isEetFirstSending({
        attempts,
        recordingDeviceId: tablet,
        deviceId,
        startsAt,
        now: minutesAfterStart(minutes),
      })
    ).toBe(expected)
  })
})

describe("hasLostEetAnswer", () => {
  test("sees an attempt whose answer was never recorded", () => {
    const later = TimestampMs(startsAt + 60_000)
    expect(hasLostEetAnswer(noAttempt)).toBe(false)
    expect(
      hasLostEetAnswer({ attemptStartedAt: startsAt, lastAttemptAt: startsAt })
    ).toBe(false)
    expect(
      hasLostEetAnswer({ attemptStartedAt: startsAt, lastAttemptAt: null })
    ).toBe(true)
    expect(
      hasLostEetAnswer({ attemptStartedAt: later, lastAttemptAt: startsAt })
    ).toBe(true)
  })
})

describe("getEetRecordingDeviceWaitEndsAt", () => {
  test("keeps another device waiting for 10 minutes unless an attempt exists", () => {
    const endsAt = startsAt + 10 * 60 * 1000
    const wait = (deviceId: DeviceId, minutes: number, attempts = noAttempt) =>
      getEetRecordingDeviceWaitEndsAt({
        attempts,
        recordingDeviceId: tablet,
        deviceId,
        startsAt,
        now: minutesAfterStart(minutes),
      })

    expect(wait(phone, 3)).toBe(endsAt)
    expect(wait(phone, 10)).toBeNull()
    expect(wait(tablet, 3)).toBeNull()
    expect(
      wait(phone, 3, { attemptStartedAt: startsAt, lastAttemptAt: startsAt })
    ).toBeNull()
  })
})

describe("getEetReversalStartsAt", () => {
  test("starts at the later of the refund and its sale's confirmation", () => {
    const refundedAt = TimestampMs(Date.parse("2027-01-10T08:00:00.000Z"))

    expect(
      getEetReversalStartsAt({
        refundedAt,
        saleConfirmedAt: "2027-01-09T16:45:40+01:00" as EetDateTime,
      })
    ).toBe(refundedAt)
    expect(
      getEetReversalStartsAt({
        refundedAt,
        saleConfirmedAt: "2027-01-10T10:00:00+01:00" as EetDateTime,
      })
    ).toBe(Date.parse("2027-01-10T09:00:00.000Z"))
  })
})

describe("isEetSandboxActive", () => {
  const enabledAt = 1_780_000_000_000 as Parameters<
    typeof isEetSandboxActive
  >[0]["enabledAt"]

  test("is on only while EET is enabled with the playground", () => {
    expect(isEetSandboxActive({ enabledAt, environment: "playground" })).toBe(
      true
    )
    expect(isEetSandboxActive({ enabledAt, environment: "production" })).toBe(
      false
    )
    expect(
      isEetSandboxActive({ enabledAt: null, environment: "playground" })
    ).toBe(false)
  })
})

describe("deriveEetCertificateExpiry", () => {
  const now = new Date("2026-06-05T12:00:00.000Z")

  test("warns when the certificate expires in 20 days", () => {
    expect(
      deriveEetCertificateExpiry({
        validTo: new Date("2026-06-25T12:00:00.000Z"),
        now,
      })
    ).toBe("expiresSoon")
  })

  test("reports an expired certificate", () => {
    expect(
      deriveEetCertificateExpiry({
        validTo: new Date("2026-06-05T11:59:59.000Z"),
        now,
      })
    ).toBe("expired")
  })

  test("says nothing about a certificate valid for 21 more days", () => {
    expect(
      deriveEetCertificateExpiry({
        validTo: new Date("2026-06-26T12:00:00.000Z"),
        now,
      })
    ).toBe("valid")
  })
})

describe("parseEetWarnings", () => {
  test("round-trips stored warnings", () => {
    const warnings = [{ code: 4, message: "dat_trzby is in the future" }]

    expect(parseEetWarnings(JSON.stringify(warnings))).toEqual(warnings)
  })

  test("reads a broken value as no warnings", () => {
    expect(parseEetWarnings("not json")).toEqual([])
    expect(parseEetWarnings('[{"code":"x"}]')).toEqual([])
  })
})

describe("createEetExtraSaleId", () => {
  const paymentId = "payment-1" as PaymentId

  test("differs from the payment's sale and between levels", () => {
    const first = createEetExtraSaleId({
      paymentId,
      extraFrom: NonNegativeInteger(0),
    })
    const second = createEetExtraSaleId({
      paymentId,
      extraFrom: NonNegativeInteger(25_000),
    })

    expect(first).not.toBe(createEetSaleId(paymentId))
    expect(first).not.toBe(second)
    expect(
      createEetExtraSaleId({ paymentId, extraFrom: NonNegativeInteger(0) })
    ).toBe(first)
  })
})

describe("deriveDueEetExtraSale", () => {
  const enabledAt = TimestampMs(1_000_000)
  const claim = (fields: {
    readonly claimId: string
    readonly amount: number
    readonly claimedAt: number
  }): EetExtraClaim => ({
    claimId: fields.claimId as ReconciliationClaimId,
    accountTransactionId: `tx-${fields.claimId}` as AccountTransactionId,
    amount: fields.amount,
    currency: "CZK",
    paymentAmount: NonNegativeInteger(25_000),
    paymentCurrency: "CZK",
    paymentAmountSats: null,
    claimedAt: TimestampMs(fields.claimedAt),
    deviceId: null,
    method: "iban",
  })
  const card = claim({ claimId: "a", amount: 25_000, claimedAt: 2_000_000 })
  const bank = claim({ claimId: "b", amount: 25_000, claimedAt: 3_000_000 })

  test("reports a second settlement from the settlement that brought it", () => {
    expect(
      deriveDueEetExtraSale({
        claims: [bank, card],
        amount: NonNegativeInteger(25_000),
        enabledAt,
        reportedExtra: NonNegativeInteger(0),
      })
    ).toEqual({ extraFrom: 0, amount: 25_000, claim: bank })
  })

  test("reports only the increase over what is already reported", () => {
    const more = claim({ claimId: "c", amount: 10_000, claimedAt: 4_000_000 })

    expect(
      deriveDueEetExtraSale({
        claims: [card, bank, more],
        amount: NonNegativeInteger(25_000),
        enabledAt,
        reportedExtra: NonNegativeInteger(25_000),
      })
    ).toEqual({ extraFrom: 25_000, amount: 10_000, claim: more })
  })

  test("has nothing due once the extra money is reported", () => {
    expect(
      deriveDueEetExtraSale({
        claims: [card, bank],
        amount: NonNegativeInteger(25_000),
        enabledAt,
        reportedExtra: NonNegativeInteger(25_000),
      })
    ).toBeNull()
  })

  test("reports the rest of a split from the settlement that brought it", () => {
    const rest = claim({ claimId: "b", amount: 10_000, claimedAt: 3_000_000 })

    expect(
      deriveDueEetExtraSale({
        claims: [
          rest,
          claim({ claimId: "a", amount: 15_000, claimedAt: 2_000_000 }),
        ],
        amount: NonNegativeInteger(25_000),
        enabledAt,
        reportedExtra: NonNegativeInteger(0),
      })
    ).toEqual({ extraFrom: 0, amount: 10_000, claim: rest })
  })

  test("has nothing due while the rest of a short settlement has not arrived", () => {
    expect(
      deriveDueEetExtraSale({
        claims: [claim({ claimId: "a", amount: 15_000, claimedAt: 2_000_000 })],
        amount: NonNegativeInteger(25_000),
        enabledAt,
        reportedExtra: NonNegativeInteger(0),
      })
    ).toBeNull()
  })

  test("reports the part of one transfer above the payment", () => {
    const transfer = claim({
      claimId: "a",
      amount: 100_000,
      claimedAt: 2_000_000,
    })

    expect(
      deriveDueEetExtraSale({
        claims: [transfer],
        amount: NonNegativeInteger(25_000),
        enabledAt,
        reportedExtra: NonNegativeInteger(0),
      })
    ).toEqual({ extraFrom: 0, amount: 75_000, claim: transfer })
  })

  test("never reports extra money brought before EET was enabled", () => {
    expect(
      deriveDueEetExtraSale({
        claims: [card, bank],
        amount: NonNegativeInteger(25_000),
        enabledAt: TimestampMs(3_500_000),
        reportedExtra: NonNegativeInteger(0),
      })
    ).toBeNull()
  })

  test("reports extra money brought after EET was enabled again", () => {
    const more = claim({ claimId: "c", amount: 10_000, claimedAt: 5_000_000 })

    expect(
      deriveDueEetExtraSale({
        claims: [card, bank, more],
        amount: NonNegativeInteger(25_000),
        enabledAt: TimestampMs(4_500_000),
        reportedExtra: NonNegativeInteger(25_000),
      })
    ).toEqual({ extraFrom: 25_000, amount: 10_000, claim: more })
  })

  test("breaks a tie on the settlement time by claim id", () => {
    const tied = claim({ claimId: "c", amount: 25_000, claimedAt: 3_000_000 })

    expect(
      deriveDueEetExtraSale({
        claims: [tied, card, bank],
        amount: NonNegativeInteger(25_000),
        enabledAt,
        reportedExtra: NonNegativeInteger(0),
      })?.claim
    ).toBe(tied)
  })
})
