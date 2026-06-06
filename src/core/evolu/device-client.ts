import {
  AppName,
  type Evolu as BaseEvolu,
  createEvolu,
  createIdFromString,
  createQueryBuilder,
  id,
  Mnemonic,
  testAppOwner,
} from "@evolu/common"
import { z } from "zod"
import { webEvoluRun } from "@/core/evolu/web-runtime.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
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
export type AccountId = typeof AccountIdRaw.Type

export const AccountEvoluTransportIdRaw = id("DeviceAccountEvoluTransportId")
export const AccountEvoluTransportId = standardSchemaToZod(
  AccountEvoluTransportIdRaw
)
export type AccountEvoluTransportId = typeof AccountEvoluTransportIdRaw.Type

export const DeviceSettingsIdRaw = id("DeviceSettings")
export const DeviceSettingsId = standardSchemaToZod(DeviceSettingsIdRaw)
export type DeviceSettingsId = typeof DeviceSettingsIdRaw.Type

export const deviceSettingsId = createIdFromString<"DeviceSettings">(
  "payky-device-settings"
)

const DeviceLanguageSchema = z.enum(["en", "cs"])
const DeviceThemeSchema = z.enum(["system", "light", "dark"])
const DeviceLocaleSchema = z.enum(["cs-CZ", "en-US"])

export type DeviceLanguage = z.output<typeof DeviceLanguageSchema>
export type DeviceTheme = z.output<typeof DeviceThemeSchema>
export type DeviceLocale = z.output<typeof DeviceLocaleSchema>

export interface DeviceSettings {
  readonly id: DeviceSettingsId
  readonly language: DeviceLanguage
  readonly theme: DeviceTheme
  readonly locale: DeviceLocale
}

const deviceEvoluSchema = {
  account: {
    id: AccountId,
    name: NonEmptyString255Schema,
    mnemonic: Mnemonic,
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
  },
} as const

export type DeviceSettingsRow = InferTable<
  (typeof deviceEvoluSchema)["deviceSettings"]
>

export function getDeviceLocaleForLanguage(
  language: DeviceLanguage
): DeviceLocale {
  return language === "cs" ? "cs-CZ" : "en-US"
}

export function createDefaultDeviceSettings(
  language: DeviceLanguage = "en"
): DeviceSettings {
  return {
    id: deviceSettingsId,
    language,
    theme: "system",
    locale: getDeviceLocaleForLanguage(language),
  }
}

export const createDeviceQuery = createQueryBuilder(deviceEvoluSchema)

export const createDeviceEvolu = async () => {
  const evolu = await webEvoluRun.orThrow(
    createEvolu(deviceEvoluSchema, {
      appName: AppName.orThrow("PaykyDevice"),
      appOwner: testAppOwner,
      transports: [], // Disable syncing for now
      indexes: () => [],
    })
  )

  return evolu
}

export type DeviceEvoluSchema = typeof deviceEvoluSchema
export type DeviceEvolu = BaseEvolu<DeviceEvoluSchema>
