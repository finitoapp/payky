import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const StationIdRaw = id("Station")
export const StationId = standardSchemaToZod(StationIdRaw)
export type StationId = typeof StationIdRaw.Output

export const StationReportIdRaw = id("StationReport")
export const StationReportId = standardSchemaToZod(StationReportIdRaw)
export type StationReportId = typeof StationReportIdRaw.Output

export const StationConfigIdRaw = id("StationConfig")
export const StationConfigId = standardSchemaToZod(StationConfigIdRaw)
export type StationConfigId = typeof StationConfigIdRaw.Output

export const StationSessionIdRaw = id("StationSession")
export const StationSessionId = standardSchemaToZod(StationSessionIdRaw)
export type StationSessionId = typeof StationSessionIdRaw.Output

export const StationOutboxIdRaw = id("StationOutbox")
export const StationOutboxId = standardSchemaToZod(StationOutboxIdRaw)
export type StationOutboxId = typeof StationOutboxIdRaw.Output
