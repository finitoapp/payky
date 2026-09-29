import { id } from "@evolu/common"
import { z } from "zod"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const EetSettingsIdRaw = id("EetSettings")
export const EetSettingsId = standardSchemaToZod(EetSettingsIdRaw)
export type EetSettingsId = typeof EetSettingsIdRaw.Output

export const EetCertificateIdRaw = id("EetCertificate")
export const EetCertificateId = standardSchemaToZod(EetCertificateIdRaw)
export type EetCertificateId = typeof EetCertificateIdRaw.Output

export const EetSaleIdRaw = id("EetSale")
export const EetSaleId = standardSchemaToZod(EetSaleIdRaw)
export type EetSaleId = typeof EetSaleIdRaw.Output

export const EetReversalIdRaw = id("EetReversal")
export const EetReversalId = standardSchemaToZod(EetReversalIdRaw)
export type EetReversalId = typeof EetReversalIdRaw.Output

export const EetEnvironmentSchema = z.enum(["production", "playground"])
export type EetEnvironment = z.output<typeof EetEnvironmentSchema>

export const EetTipOwnerSchema = z.enum(["business", "employees"])
export type EetTipOwner = z.output<typeof EetTipOwnerSchema>

export const EetEstablishmentIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,8}$/u)
  .brand<"EetEstablishmentId">()
export type EetEstablishmentId = z.output<typeof EetEstablishmentIdSchema>

export const EetEicSchema = z
  .string()
  .regex(/^CZ[0-9]{8,10}$/u)
  .brand<"EetEic">()
export type EetEic = z.output<typeof EetEicSchema>

export const EetCashRegisterIdSchema = z
  .string()
  .regex(/^[0-9a-zA-Z.,:;/#\-_ ]{1,20}$/u)
  .brand<"EetCashRegisterId">()
export type EetCashRegisterId = z.output<typeof EetCashRegisterIdSchema>

export const EetSequenceNumberSchema = z
  .string()
  .regex(/^[0-9a-zA-Z.,:;/#\-_ ]{1,25}$/u)
  .brand<"EetSequenceNumber">()
export type EetSequenceNumber = z.output<typeof EetSequenceNumberSchema>

export const EetDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$/u)
  .brand<"EetDateTime">()
export type EetDateTime = z.output<typeof EetDateTimeSchema>

export const EetBase64Schema = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/u)
  .brand<"EetBase64">()
export type EetBase64 = z.output<typeof EetBase64Schema>

export const EetUnsupportedReasonSchema = z.enum([
  "currency",
  "amount",
  "disabled",
  "environment",
  "taxpayer",
])
export type EetUnsupportedReason = z.output<typeof EetUnsupportedReasonSchema>

export const EetAttemptResultSchema = z.enum(["retry", "rejected"])
export type EetAttemptResult = z.output<typeof EetAttemptResultSchema>

export const EetWarningSchema = z.object({
  code: z.number().int(),
  message: z.string().optional(),
})
export type EetWarning = z.output<typeof EetWarningSchema>

export type EetSaleStatus =
  | "pending"
  | "confirmed"
  | "testConfirmed"
  | "rejected"
  | "unsupported"

export type EetCertificateExpiry = "valid" | "expiresSoon" | "expired"

export type EetConfigurationGap =
  | "certificate"
  | "certificateExpired"
  | "establishment"
