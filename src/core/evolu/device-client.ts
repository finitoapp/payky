import {
  AppName,
  type Evolu as BaseEvolu,
  createAppOwner,
  createEvolu,
  createIdFromString,
  createQueryBuilder,
  type Evolu,
  type EvoluDeps,
  id,
  OwnerSecret,
  ok,
  sqliteFalse,
  type Task,
} from "@evolu/common"
import { z } from "zod"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import { MasterKeySchema } from "@/core/modules/shared/key-derivation.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  SqliteBoolSchema,
  TimestampMsSchema,
  WssUrlSchema,
} from "@/core/modules/shared/schema"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const AccountIdRaw = id("DeviceAccountId")
export const AccountId = standardSchemaToZod(AccountIdRaw)
export type AccountId = typeof AccountIdRaw.Output

export const AccountEvoluTransportIdRaw = id("DeviceAccountEvoluTransportId")
export const AccountEvoluTransportId = standardSchemaToZod(
  AccountEvoluTransportIdRaw
)
export type AccountEvoluTransportId = typeof AccountEvoluTransportIdRaw.Output

export const DeviceSettingsIdRaw = id("DeviceSettings")
export const DeviceSettingsId = standardSchemaToZod(DeviceSettingsIdRaw)
export type DeviceSettingsId = typeof DeviceSettingsIdRaw.Output

export const deviceSettingsId = createIdFromString<"DeviceSettings">(
  "payky-device-settings"
)

const DeviceLanguageSchema = z.enum(["en", "cs", "sk"])
const DeviceThemeSchema = z.enum(["system", "light", "dark"])
const DeviceLocaleSchema = z.enum(["cs-CZ", "en-US", "sk-SK"])

export type DeviceLanguage = z.output<typeof DeviceLanguageSchema>
export type DeviceTheme = z.output<typeof DeviceThemeSchema>
export type DeviceLocale = z.output<typeof DeviceLocaleSchema>

export interface DeviceSettings {
  readonly id: DeviceSettingsId
  readonly language: DeviceLanguage
  readonly theme: DeviceTheme
  readonly locale: DeviceLocale
  readonly errorReportingEnabled: 0 | 1
}

const deviceEvoluSchema = {
  account: {
    id: AccountId,
    name: NonEmptyString255Schema,
    masterKey: MasterKeySchema,
    lastUseAt: TimestampMsSchema,
  },
  accountEvoluTransport: {
    id: AccountEvoluTransportId,
    accountId: AccountId,
    type: z.enum(["WebSocket"]),
    isActive: SqliteBoolSchema,
  },
  accountEvoluTransportWebsocket: {
    id: AccountEvoluTransportId,
    url: WssUrlSchema,
  },
  device: {
    id: DeviceId,
    name: NonEmptyString255Schema,
    deviceType: z.string().nullable(),
    deviceVendor: z.string().nullable(),
    browserName: z.string().nullable(),
    osName: z.string().nullable(),
  },
  deviceSettings: {
    id: DeviceSettingsId,
    language: DeviceLanguageSchema.nullable(),
    theme: DeviceThemeSchema.nullable(),
    locale: DeviceLocaleSchema.nullable(),
    errorReportingEnabled: SqliteBoolSchema.nullable(),
  },
} as const

export type DeviceSettingsRow = InferTable<
  (typeof deviceEvoluSchema)["deviceSettings"]
>

export function getDeviceLocaleForLanguage(
  language: DeviceLanguage
): DeviceLocale {
  if (language === "cs") {
    return "cs-CZ"
  }

  if (language === "sk") {
    return "sk-SK"
  }

  return "en-US"
}

export function createDefaultDeviceSettings(
  language: DeviceLanguage = "en"
): DeviceSettings {
  return {
    id: deviceSettingsId,
    language,
    theme: "system",
    locale: getDeviceLocaleForLanguage(language),
    errorReportingEnabled: sqliteFalse,
  }
}

export const createDeviceQuery = createQueryBuilder(deviceEvoluSchema)

// Currently a static ownerSecret. Plan to migrate to WebAuthn+PRF, see
// https://github.com/finitoapp/payky/issues/5
const ownerSecret = OwnerSecret.orThrow(
  new Uint8Array([
    32, 99, 101, 230, 222, 46, 149, 166, 144, 165, 217, 240, 14, 24, 40, 8, 210,
    93, 169, 86, 19, 180, 45, 103, 217, 209, 37, 156, 30, 227, 201, 137,
  ])
)
const appOwner = createAppOwner(ownerSecret)

export const createDeviceEvolu: Task<
  Evolu<DeviceEvoluSchema>,
  never,
  EvoluDeps
> = async (run) => {
  const evolu = await run.ok(
    createEvolu(deviceEvoluSchema, {
      appName: AppName.orThrow("PaykyDevice"),
      appOwner,
      transports: [], // Disable syncing for now
      indexes: () => [],
    })
  )

  return ok(evolu)
}

export type DeviceEvoluSchema = typeof deviceEvoluSchema
export type DeviceEvolu = BaseEvolu<DeviceEvoluSchema>
