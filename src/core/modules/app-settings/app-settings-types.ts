import { id } from "@evolu/common"
import { z } from "zod"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const AppSettingsIdRaw = id("AppSettings")
export const AppSettingsId = standardSchemaToZod(AppSettingsIdRaw)
export type AppSettingsId = typeof AppSettingsIdRaw.Type

export const DefaultPaymentMethodSchema = z.enum([
  "cashRegister",
  "spark",
  "iban",
])
export type DefaultPaymentMethod = z.output<typeof DefaultPaymentMethodSchema>
