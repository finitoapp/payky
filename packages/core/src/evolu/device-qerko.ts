import {
  createIdFromString,
  type MutationOptions,
  sqliteTrue,
} from "@evolu/common"
import type { NonEmptyString255 as NonEmptyString255Value } from "../modules/shared/schema.ts"
import {
  createDeviceQuery,
  type DeviceAccountId,
  type DeviceEvolu,
  type QerkoTerminalSelectionId,
} from "./device-client.ts"

/**
 * The Qerko terminal this device pays on (qerko/0001). One selection per
 * account, so its id derives from the account's.
 */

const selectionId = (accountId: DeviceAccountId): QerkoTerminalSelectionId =>
  createIdFromString<"QerkoTerminalSelection">(
    `qerko-terminal-selection:${accountId}`
  )

export const qerkoTerminalSelectionQuery = (accountId: DeviceAccountId) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("qerkoTerminalSelection")
      .select(["terminalId", "terminalTid", "locationName"])
      .where("id", "=", selectionId(accountId))
      .where("terminalId", "is not", null)
      .where("terminalTid", "is not", null)
      .where("locationName", "is not", null)
      .where("isDeleted", "is not", sqliteTrue)
  )

export const selectQerkoTerminal = (
  deviceEvolu: DeviceEvolu,
  {
    accountId,
    terminalId,
    terminalTid,
    locationName,
  }: {
    readonly accountId: DeviceAccountId
    readonly terminalId: NonEmptyString255Value
    readonly terminalTid: NonEmptyString255Value
    readonly locationName: NonEmptyString255Value
  },
  options?: MutationOptions
): void => {
  deviceEvolu.upsert(
    "qerkoTerminalSelection",
    {
      id: selectionId(accountId),
      accountId,
      terminalId,
      terminalTid,
      locationName,
      isDeleted: 0,
    },
    options
  )
}

export const clearQerkoTerminal = (
  deviceEvolu: DeviceEvolu,
  accountId: DeviceAccountId,
  options?: MutationOptions
): void => {
  deviceEvolu.update(
    "qerkoTerminalSelection",
    { id: selectionId(accountId), isDeleted: sqliteTrue },
    options
  )
}
