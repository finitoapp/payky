import {
  createId,
  createOwnerSecret,
  createRandomBytes,
  evoluJsonArrayFrom,
  evoluJsonObjectFrom,
  type KyselyNotNull,
  type Mnemonic,
  ownerSecretToMnemonic,
  sqliteTrue,
} from "@evolu/common"
import { faker } from "@faker-js/faker"
import { atom } from "jotai"
import { UAParser } from "ua-parser-js"
import { deviceEvoluAtom } from "@/atoms/device-evolu"
import { evoluCounterAtom } from "@/atoms/evolu-counter.ts"
import {
  createDeviceQuery,
  type DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { NonEmptyString255, WssUrl } from "@/core/modules/shared/schema.ts"

const getDeviceId = () => {
  const id = (localStorage.getItem("payky.deviceId") ??
    createId({
      randomBytes: createRandomBytes(),
    })) as DeviceId
  localStorage.setItem("payky.deviceId", id)

  return id
}

const getDevice = () => {
  const uap = new UAParser()

  const device = uap.getDevice()
  const browser = uap.getBrowser()
  const os = uap.getOS()

  return {
    id: getDeviceId(),
    name: NonEmptyString255(faker.internet.username()),
    deviceType: device.type ?? null,
    deviceVendor: device.vendor ?? null,
    browserName: browser.name ?? null,
    osName: os.name ?? null,
  }
}

const activeAccountQuery = createDeviceQuery((db) =>
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

export const createAccountMnemonic = (): Mnemonic =>
  ownerSecretToMnemonic(
    createOwnerSecret({
      randomBytes: createRandomBytes(),
    })
  )

const createRandomAccountName = () =>
  NonEmptyString255(faker.internet.username())

const insertAccount = (
  deviceEvolu: DeviceEvolu,
  mnemonic: Mnemonic,
  accountName?: string | undefined
) => {
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
    isActive: sqliteTrue,
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
    transports: [
      {
        type: "WebSocket" as const,
        url: transportUrl,
      },
    ],
  }
}

const activeAccountRowAtom = atom(async (get) => {
  get(evoluCounterAtom) // We want to reload evolu when counter is increased
  const deviceEvolu = await get(deviceEvoluAtom)
  const activeAccountRow = await loadActiveAccountRow(deviceEvolu)

  return activeAccountRow ?? insertAccount(deviceEvolu, createAccountMnemonic())
})

async function loadActiveAccountRow(deviceEvolu: DeviceEvolu) {
  const data = await deviceEvolu.loadQuery(activeAccountQuery)
  return data[0] ?? null
}

export const accountAtom = atom(async (get) => {
  const deviceEvolu = await get(deviceEvoluAtom)
  const row = await get(activeAccountRowAtom)

  if (row === null) {
    throw new Error(
      "No active account found in device Evolu. Complete onboarding first."
    )
  }

  let device = row.device
  if (device === null) {
    device = getDevice()
    deviceEvolu.upsert("device", device)
  }

  return {
    id: row.id,
    mnemonic: row.mnemonic,
    name: row.name,
    transports: row.transports,
    device,
  }
})
