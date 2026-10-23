import { id } from "@evolu/common"
import { standardSchemaToZod } from "../../zod-utils.ts"

export const QerkoPluginIdRaw = id("QerkoPlugin")
export const QerkoPluginId = standardSchemaToZod(QerkoPluginIdRaw)
export type QerkoPluginId = typeof QerkoPluginIdRaw.Output
