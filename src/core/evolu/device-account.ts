import {
  createOwnerSecret,
  createRandomBytes,
  evoluJsonArrayFrom,
  evoluJsonObjectFrom,
  type KyselyNotNull,
  type Mnemonic,
  ownerSecretToMnemonic,
  sqliteFalse,
  sqliteTrue,
} from "@evolu/common"
import { faker } from "@faker-js/faker"

import {
  type AccountId,
  createDeviceQuery,
  type DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { NonEmptyString255, WssUrl } from "@/core/modules/shared/schema.ts"

export interface DeviceAccount {
  readonly id: AccountId
  readonly mnemonic: Mnemonic
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
      "account.mnemonic as mnemonic",
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
    .where("account.mnemonic", "is not", null)
    .where("account.name", "is not", null)
    .orderBy("account.lastUseAt", "desc")
    .limit(1)
    .$narrowType<{
      name: KyselyNotNull
      mnemonic: KyselyNotNull
    }>()
)

export const accountByMnemonicQuery = (mnemonic: Mnemonic) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("account")
      .select(["account.id", "account.mnemonic", "account.name"])
      .where("account.isDeleted", "is not", sqliteTrue)
      .where("account.mnemonic", "=", mnemonic)
      .where("account.name", "is not", null)
      .limit(1)
      .$narrowType<{
        name: KyselyNotNull
        mnemonic: KyselyNotNull
      }>()
  )

export const accountListQuery = createDeviceQuery((db) =>
  db
    .selectFrom("account")
    .select(["account.id", "account.name", "account.createdAt"])
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.name", "is not", null)
    .where("account.mnemonic", "is not", null)
    .where("account.createdAt", "is not", null)
    .orderBy("account.createdAt", "asc")
    .$narrowType<{
      name: KyselyNotNull
      createdAt: KyselyNotNull
    }>()
)

export const createAccountMnemonic = (): Mnemonic =>
  ownerSecretToMnemonic(
    createOwnerSecret({
      randomBytes: createRandomBytes(),
    })
  )

export const createRandomAccountName = () =>
  NonEmptyString255(faker.internet.username())

export const insertAccount = (
  deviceEvolu: DeviceEvolu,
  mnemonic: Mnemonic,
  accountName?: string | undefined
): DeviceAccount => {
  const name = accountName
    ? NonEmptyString255(accountName)
    : createRandomAccountName()
  const transportUrl = WssUrl("wss://free.evoluhq.com")

  const { id: accountId } = deviceEvolu.insert("account", {
    name,
    mnemonic,
    lastUseAt: Date.now(),
  })
  const { id } = deviceEvolu.insert("accountEvoluTransport", {
    accountId,
    type: "WebSocket",
    isActive: sqliteFalse,
  })
  deviceEvolu.upsert("accountEvoluTransportWebsocket", {
    id,
    url: transportUrl,
  })

  return {
    id: accountId,
    mnemonic,
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
  mnemonic: Mnemonic
): Promise<{ readonly accountId: AccountId; readonly created: boolean }> {
  const existingAccounts = await deviceEvolu.loadQuery(
    accountByMnemonicQuery(mnemonic)
  )
  const existingAccount = existingAccounts[0]

  if (existingAccount !== undefined) {
    selectAccount(deviceEvolu, existingAccount.id)
    return { accountId: existingAccount.id, created: false }
  }

  const account = insertAccount(deviceEvolu, mnemonic)
  return { accountId: account.id, created: true }
}

export function selectAccount(deviceEvolu: DeviceEvolu, accountId: AccountId) {
  deviceEvolu.update("account", {
    id: accountId,
    lastUseAt: Date.now(),
  })
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
