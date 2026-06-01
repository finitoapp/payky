import {
  AppName,
  type Evolu as BaseEvolu,
  createEvolu,
  createQueryBuilder,
  id,
  Mnemonic,
  testAppOwner,
} from "@evolu/common"
import { createEvoluDeps, createRun } from "@evolu/web"
import { z } from "zod"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
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

const DeviceSchema = {
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
} as const

export const createDeviceQuery = createQueryBuilder(DeviceSchema)

export const createDeviceEvolu = async () => {
  const run = createRun(createEvoluDeps())
  const evolu = await run.orThrow(
    createEvolu(DeviceSchema, {
      appName: AppName.orThrow("PaykyDevice"),
      appOwner: testAppOwner,
      transports: [], // Disable syncing for now
      indexes: () => [],
    })
  )

  return evolu
}

export type DeviceEvoluSchema = typeof DeviceSchema
export type DeviceEvolu = BaseEvolu<DeviceEvoluSchema>
