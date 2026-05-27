import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const AppSettingsIdRaw = id("AppSettings")
export const AppSettingsId = standardSchemaToZod(AppSettingsIdRaw)
export type AppSettingsId = typeof AppSettingsIdRaw.Type
