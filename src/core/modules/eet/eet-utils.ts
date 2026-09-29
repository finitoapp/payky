import { createIdFromString } from "@evolu/common"
import { addDays, addHours, format, parseISO } from "date-fns"
import { z } from "zod"

import type { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  type EetAttemptResult,
  type EetBase64,
  EetBase64Schema,
  type EetCashRegisterId,
  EetCashRegisterIdSchema,
  type EetCertificateExpiry,
  type EetCertificateId,
  type EetConfigurationGap,
  type EetDateTime,
  EetDateTimeSchema,
  type EetEnvironment,
  type EetEstablishmentId,
  type EetReversalId,
  type EetSaleId,
  type EetSaleStatus,
  type EetSettingsId,
  type EetUnsupportedReason,
  type EetWarning,
  EetWarningSchema,
} from "@/core/modules/eet/eet-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { RefundId } from "@/core/modules/refund/refund-types.ts"
import {
  type FiatCurrency,
  type NonNegativeInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"

export const eetSettingsId: EetSettingsId =
  createIdFromString<"EetSettings">("payky-eet-settings")

export const createEetSaleId = (paymentId: PaymentId): EetSaleId =>
  createIdFromString<"EetSale">(`eetSale:${paymentId}`)

export const createEetReversalId = (refundId: RefundId): EetReversalId =>
  createIdFromString<"EetReversal">(`eetReversal:${refundId}`)

export const createEetCertificateId = (
  certificateDer: EetBase64
): EetCertificateId =>
  createIdFromString<"EetCertificate">(`eetCertificate:${certificateDer}`)

const EET_MAX_AMOUNT_MINOR_UNITS = 9_999_999_999

const EET_OVERDUE_AFTER_HOURS = 48

const EET_CERTIFICATE_EXPIRY_WARNING_DAYS = 21

export const toEetCashRegisterId = (deviceId: DeviceId): EetCashRegisterId =>
  EetCashRegisterIdSchema.decode(deviceId.slice(0, 20))

export const formatEetDateTime = (date: Date): EetDateTime =>
  EetDateTimeSchema.decode(format(date, "yyyy-MM-dd'T'HH:mm:ssXXX"))

interface EetAttempts {
  readonly attemptStartedAt: TimestampMs | null
  readonly lastAttemptAt: TimestampMs | null
}

export const hasEetAttempt = ({
  attemptStartedAt,
  lastAttemptAt,
}: EetAttempts): boolean => attemptStartedAt !== null || lastAttemptAt !== null

export const hasLostEetAnswer = ({
  attemptStartedAt,
  lastAttemptAt,
}: EetAttempts): boolean =>
  attemptStartedAt !== null &&
  (lastAttemptAt === null || attemptStartedAt > lastAttemptAt)

export const bytesToEetBase64 = (bytes: Uint8Array): EetBase64 =>
  EetBase64Schema.decode(btoa(String.fromCharCode(...bytes)))

export const eetBase64ToBytes = (value: EetBase64): Uint8Array =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

export const getEetUnsupportedReason = ({
  amount,
  currency,
}: {
  readonly amount: NonNegativeInteger
  readonly currency: FiatCurrency
}): EetUnsupportedReason | null => {
  if (currency !== "CZK") return "currency"
  if (amount > EET_MAX_AMOUNT_MINOR_UNITS) return "amount"
  return null
}

export const resolveEetEnvironment = ({
  environment,
  isTestCertificate,
  isProductionAvailable,
}: {
  readonly environment: EetEnvironment | null
  readonly isTestCertificate: boolean
  readonly isProductionAvailable: boolean
}): EetEnvironment => {
  if (!isProductionAvailable || isTestCertificate) return "playground"
  return environment ?? "production"
}

export const deriveEetSaleStatus = ({
  confirmation,
  environment,
  unsupportedReason,
  lastAttemptResult,
}: {
  readonly confirmation: { readonly isTest: boolean } | null
  readonly environment: EetEnvironment
  readonly unsupportedReason: EetUnsupportedReason | null
  readonly lastAttemptResult: EetAttemptResult | null
}): EetSaleStatus => {
  if (confirmation !== null) {
    return confirmation.isTest || environment === "playground"
      ? "testConfirmed"
      : "confirmed"
  }
  if (unsupportedReason !== null) return "unsupported"
  if (lastAttemptResult === "rejected") return "rejected"
  return "pending"
}

export const getEetSaleOverdueAt = (saleAt: EetDateTime): TimestampMs =>
  TimestampMs(addHours(parseISO(saleAt), EET_OVERDUE_AFTER_HOURS).getTime())

export const isEetSaleOverdue = ({
  status,
  saleAt,
  now,
}: {
  readonly status: EetSaleStatus
  readonly saleAt: EetDateTime
  readonly now: Date
}): boolean =>
  (status === "pending" || status === "rejected") &&
  now.getTime() > getEetSaleOverdueAt(saleAt)

export const isEetSandboxActive = ({
  enabledAt,
  environment,
}: {
  readonly enabledAt: TimestampMs | null
  readonly environment: EetEnvironment
}): boolean => enabledAt !== null && environment === "playground"

export const deriveEetCertificateExpiry = ({
  validTo,
  now,
}: {
  readonly validTo: Date
  readonly now: Date
}): EetCertificateExpiry => {
  if (now >= validTo) return "expired"
  if (addDays(now, EET_CERTIFICATE_EXPIRY_WARNING_DAYS) > validTo) {
    return "expiresSoon"
  }
  return "valid"
}

export const findEetConfigurationGaps = ({
  validTo,
  establishmentId,
  now,
}: {
  readonly validTo: TimestampMs | null
  readonly establishmentId: EetEstablishmentId | null
  readonly now: Date
}): ReadonlyArray<EetConfigurationGap> => {
  const gaps: EetConfigurationGap[] = []
  if (validTo === null) {
    gaps.push("certificate")
  } else if (
    deriveEetCertificateExpiry({ validTo: new Date(validTo), now }) ===
    "expired"
  ) {
    gaps.push("certificateExpired")
  }
  if (establishmentId === null) gaps.push("establishment")
  return gaps
}

export const parseEetWarnings = (json: string): ReadonlyArray<EetWarning> => {
  try {
    const parsed = z.array(EetWarningSchema).safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}
