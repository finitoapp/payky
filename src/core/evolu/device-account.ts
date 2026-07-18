import {
  createIdFromString,
  evoluJsonArrayFrom,
  evoluJsonObjectFrom,
  type KyselyNotNull,
  type MutationOptions,
  sqliteFalse,
  sqliteTrue,
} from "@evolu/common"
import { faker } from "@faker-js/faker"

import {
  type AccountEvoluTransportId,
  type AccountId,
  createDeviceQuery,
  type DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  createMasterKey,
  type MasterKey,
} from "@/core/modules/shared/key-derivation.ts"
import { NonEmptyString255, WssUrl } from "@/core/modules/shared/schema.ts"

export interface DeviceAccount {
  readonly id: AccountId
  readonly masterKey: MasterKey
  readonly name: string
  readonly device: {
    readonly id: DeviceId
    readonly name: string
  } | null
  readonly transports: ReadonlyArray<{
    readonly type: "WebSocket"
    readonly url: string
  }>
}

export const activeAccountQuery = createDeviceQuery((db) =>
  db
    .selectFrom("account")
    .select((eb) => [
      "account.id as id",
      "account.masterKey as masterKey",
      "account.name as name",

      evoluJsonObjectFrom(
        eb
          .selectFrom("device")
          .select(["device.id as id", "device.name as name"])
          .where("device.isDeleted", "is not", sqliteTrue)
          .where("device.name", "is not", null)
          .$narrowType<{
            name: KyselyNotNull
          }>()
      ).as("device"),

      evoluJsonArrayFrom(
        eb
          .selectFrom("accountEvoluTransport")
          .leftJoin(
            "accountEvoluTransportWebsocket",
            "accountEvoluTransportWebsocket.id",
            "accountEvoluTransport.id"
          )
          .select([
            "accountEvoluTransport.type as type",
            "accountEvoluTransportWebsocket.url as url",
          ])
          .whereRef("accountEvoluTransport.accountId", "=", "account.id")
          .where("accountEvoluTransport.isDeleted", "is not", sqliteTrue)
          .where("accountEvoluTransport.type", "is not", null)
          .where("accountEvoluTransportWebsocket.url", "is not", null)
          .where("accountEvoluTransport.isActive", "=", sqliteTrue)
          .where(
            "accountEvoluTransportWebsocket.isDeleted",
            "is not",
            sqliteTrue
          )
          .$narrowType<{
            type: KyselyNotNull
            url: KyselyNotNull
          }>()
      ).as("transports"),
    ])
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.masterKey", "is not", null)
    .where("account.name", "is not", null)
    .orderBy("account.lastUseAt", "desc")
    .limit(1)
    .$narrowType<{
      name: KyselyNotNull
      masterKey: KyselyNotNull
    }>()
)

export const accountByMasterKeyQuery = (masterKey: MasterKey) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("account")
      .select(["account.id", "account.masterKey", "account.name"])
      .where("account.isDeleted", "is not", sqliteTrue)
      .where("account.masterKey", "=", masterKey)
      .where("account.name", "is not", null)
      .limit(1)
      .$narrowType<{
        name: KyselyNotNull
        masterKey: KyselyNotNull
      }>()
  )

export const accountListQuery = createDeviceQuery((db) =>
  db
    .selectFrom("account")
    .select(["account.id", "account.name", "account.createdAt"])
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.name", "is not", null)
    .where("account.masterKey", "is not", null)
    .where("account.createdAt", "is not", null)
    .orderBy("account.createdAt", "asc")
    .$narrowType<{
      name: KyselyNotNull
      createdAt: KyselyNotNull
    }>()
)

export const createAccountMasterKey = (): MasterKey => createMasterKey()

export const createRandomAccountName = () =>
  NonEmptyString255(faker.internet.username())

const defaultEvoluTransportUrl = WssUrl("wss://free.evoluhq.com")

const createAccountEvoluTransportId = ({
  accountId,
  type,
  url,
}: {
  readonly accountId: AccountId
  readonly type: "WebSocket"
  readonly url: WssUrl
}): AccountEvoluTransportId =>
  createIdFromString<"DeviceAccountEvoluTransportId">(
    JSON.stringify({ accountId, type, url })
  )

export const upsertAccountEvoluWebsocketTransport = (
  deviceEvolu: DeviceEvolu,
  {
    accountId,
    isActive,
    url,
  }: {
    readonly accountId: AccountId
    readonly isActive: typeof sqliteFalse | typeof sqliteTrue
    readonly url: WssUrl
  },
  options?: MutationOptions
): AccountEvoluTransportId => {
  const id = createAccountEvoluTransportId({
    accountId,
    type: "WebSocket",
    url,
  })

  deviceEvolu.upsert(
    "accountEvoluTransport",
    {
      id,
      accountId,
      type: "WebSocket",
      isActive,
    },
    options
  )
  deviceEvolu.upsert(
    "accountEvoluTransportWebsocket",
    {
      id,
      url,
    },
    options
  )

  return id
}

export const insertAccount = (
  deviceEvolu: DeviceEvolu,
  masterKey: MasterKey,
  accountName?: string | undefined
): DeviceAccount => {
  const name = accountName
    ? NonEmptyString255(accountName)
    : createRandomAccountName()
  const { id: accountId } = deviceEvolu.insert("account", {
    name,
    masterKey,
    lastUseAt: Date.now(),
  })
  upsertAccountEvoluWebsocketTransport(deviceEvolu, {
    accountId,
    isActive: sqliteFalse,
    url: defaultEvoluTransportUrl,
  })

  return {
    id: accountId,
    masterKey,
    name,
    device: null,
    transports: [],
  }
}

export async function loadActiveAccountRow(deviceEvolu: DeviceEvolu) {
  const data = await deviceEvolu.loadQuery(activeAccountQuery)
  return data[0] ?? null
}

export async function createOrSelectAccount(
  deviceEvolu: DeviceEvolu,
  masterKey: MasterKey
): Promise<{ readonly accountId: AccountId; readonly created: boolean }> {
  const existingAccounts = await deviceEvolu.loadQuery(
    accountByMasterKeyQuery(masterKey)
  )
  const existingAccount = existingAccounts[0]

  if (existingAccount !== undefined) {
    selectAccount(deviceEvolu, existingAccount.id)
    return { accountId: existingAccount.id, created: false }
  }

  const account = insertAccount(deviceEvolu, masterKey)
  return { accountId: account.id, created: true }
}

/**
 * Selects an account from a recovery phrase. Newly imported accounts activate
 * the default relay so their remote application data can synchronize.
 */
export async function restoreOrSelectAccount(
  deviceEvolu: DeviceEvolu,
  masterKey: MasterKey
): Promise<{ readonly accountId: AccountId; readonly created: boolean }> {
  const result = await createOrSelectAccount(deviceEvolu, masterKey)

  if (result.created) {
    upsertAccountEvoluWebsocketTransport(deviceEvolu, {
      accountId: result.accountId,
      isActive: sqliteTrue,
      url: defaultEvoluTransportUrl,
    })
  }

  return result
}

export function selectAccount(deviceEvolu: DeviceEvolu, accountId: AccountId) {
  deviceEvolu.update("account", {
    id: accountId,
    lastUseAt: Date.now(),
  })
}

export function updateAccountName(
  deviceEvolu: DeviceEvolu,
  accountId: AccountId,
  name: string,
  options?: MutationOptions
) {
  deviceEvolu.update(
    "account",
    {
      id: accountId,
      name: NonEmptyString255(name),
    },
    options
  )
}

export function removeDeviceAccount(
  deviceEvolu: DeviceEvolu,
  accountId: AccountId
) {
  deviceEvolu.update("account", {
    id: accountId,
    isDeleted: sqliteTrue,
  })
}
