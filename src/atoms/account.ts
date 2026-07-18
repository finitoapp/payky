import { createId, createRandomBytes } from "@evolu/common"
import { faker } from "@faker-js/faker"
import { atom } from "jotai"
import { UAParser } from "ua-parser-js"
import { deviceEvoluAtom } from "@/atoms/device-evolu"
import { evoluCounterAtom } from "@/atoms/evolu-counter.ts"
import {
  createAccountMasterKey,
  insertAccount,
  loadActiveAccountRow,
} from "@/core/evolu/device-account.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { masterKeyToMnemonic } from "@/core/modules/shared/key-derivation.ts"
import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"

const getDeviceId = () => {
  const id = (localStorage.getItem("payky.deviceId") ??
    createId({
      randomBytes: createRandomBytes(),
    })) as DeviceId
  localStorage.setItem("payky.deviceId", id)

  return id
}

const toOptionalDeviceLabel = (value: string | undefined) =>
  value === undefined || value === ""
    ? null
    : NonEmptyString255(value.slice(0, 255))

const getDevice = () => {
  const uap = new UAParser()

  const device = uap.getDevice()
  const browser = uap.getBrowser()
  const os = uap.getOS()

  return {
    id: getDeviceId(),
    name: NonEmptyString255(faker.internet.username()),
    deviceType: toOptionalDeviceLabel(device.type),
    deviceVendor: toOptionalDeviceLabel(device.vendor),
    browserName: toOptionalDeviceLabel(browser.name),
    osName: toOptionalDeviceLabel(os.name),
  }
}

const activeAccountRowAtom = atom(async (get) => {
  get(evoluCounterAtom) // We want to reload evolu when counter is increased
  const deviceEvolu = await get(deviceEvoluAtom)
  const activeAccountRow = await loadActiveAccountRow(deviceEvolu)

  return (
    activeAccountRow ?? insertAccount(deviceEvolu, createAccountMasterKey())
  )
})

export const accountAtom = atom(async (get) => {
  const deviceEvolu = await get(deviceEvoluAtom)
  const row = await get(activeAccountRowAtom)

  if (row === null) {
    throw new Error(
      "No active account found in device Evolu. Complete onboarding first."
    )
  }

  const device =
    row.device !== null
      ? { id: row.device.id, name: NonEmptyString255(row.device.name) }
      : getDevice()
  if (row.device === null) {
    deviceEvolu.upsert("device", device)
  }

  return {
    id: row.id,
    masterKey: row.masterKey,
    name: row.name,
    transports: row.transports,
    device,
  }
})

/**
 * Split out from `accountAtom` because deriving the SLIP-39 recovery phrase
 * runs a costly PBKDF2-based encoding — only the screens that actually
 * display it should pay for it, not every consumer of the account (Evolu
 * bootstrap, `useAppRun`, ...).
 */
export const recoveryMnemonicAtom = atom(async (get) => {
  const account = await get(accountAtom)
  return masterKeyToMnemonic(account.masterKey)
})
