import {
  QerkoCountrySchema,
  QerkoEnvironmentSchema,
} from "../../integrations/qerko/qerko-client.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
} from "../shared/schema.ts"
import { QerkoPluginId } from "./qerko-plugin-types.ts"

/**
 * The pairing with Qerko (qerko/0001): the API key the pairing issued, kept
 * in the synced database like the Fio token so every device of the account
 * can start payments. `environment` is the Qerko API the key belongs to — a
 * sandbox key is useless in production — so the two are stored together.
 * Which terminal a device pays on is not here but in the device database
 * (`qerkoTerminalSelection`).
 */
export const qerkoPlugin = {
  id: QerkoPluginId,
  environment: QerkoEnvironmentSchema,
  apiKey: NonEmptyStringSchema,
  apiKeyName: NonEmptyString255Schema,
  legalEntityName: NonEmptyString255Schema,
  identificationNumber: NonEmptyString255Schema,
  country: QerkoCountrySchema,
} as const

export type QerkoPluginRow = InferTable<typeof qerkoPlugin>
