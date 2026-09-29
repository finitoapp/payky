import { describe, expect, test } from "vitest"

import type { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  type EetDateTime,
  EetEstablishmentIdSchema,
} from "@/core/modules/eet/eet-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  NonNegativeInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import {
  bytesToEetBase64,
  createEetSaleId,
  deriveEetCertificateExpiry,
  deriveEetSaleStatus,
  eetBase64ToBytes,
  formatEetDateTime,
  getEetUnsupportedReason,
  hasLostEetAnswer,
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

describe("hasLostEetAnswer", () => {
  test("sees an attempt whose answer was never recorded", () => {
    const startedAt = TimestampMs(Date.parse("2027-01-09T15:45:36.000Z"))
    const later = TimestampMs(startedAt + 60_000)
    expect(
      hasLostEetAnswer({ attemptStartedAt: null, lastAttemptAt: null })
    ).toBe(false)
    expect(
      hasLostEetAnswer({
        attemptStartedAt: startedAt,
        lastAttemptAt: startedAt,
      })
    ).toBe(false)
    expect(
      hasLostEetAnswer({ attemptStartedAt: startedAt, lastAttemptAt: null })
    ).toBe(true)
    expect(
      hasLostEetAnswer({ attemptStartedAt: later, lastAttemptAt: startedAt })
    ).toBe(true)
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
