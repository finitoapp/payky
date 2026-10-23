import { describe, expect, test } from "vitest"
import { MasterKey } from "../modules/shared/key-derivation.ts"
import { NonEmptyString255 } from "../modules/shared/schema.ts"
import { createTestDeviceEvolu } from "../testing/device-evolu.ts"
import { deriveDeviceAccountId } from "./device-account.ts"
import {
  clearQerkoTerminal,
  qerkoTerminalSelectionQuery,
  selectQerkoTerminal,
} from "./device-qerko.ts"

const terminal = (id: string) => ({
  terminalId: NonEmptyString255(id),
  terminalTid: NonEmptyString255(`tid-${id}`),
  locationName: NonEmptyString255("Cafe"),
})

describe("qerko terminal selection", () => {
  const accountId = deriveDeviceAccountId(
    MasterKey("000102030405060708090a0b0c0d0e0f")
  )
  const otherAccountId = deriveDeviceAccountId(
    MasterKey("0f0e0d0c0b0a09080706050403020100")
  )

  test("remembers one terminal per account and replaces it", async () => {
    await using test = await createTestDeviceEvolu()
    const { deviceEvolu } = test

    selectQerkoTerminal(deviceEvolu, { accountId, ...terminal("t-1") })
    selectQerkoTerminal(deviceEvolu, {
      accountId: otherAccountId,
      ...terminal("t-other"),
    })
    selectQerkoTerminal(deviceEvolu, { accountId, ...terminal("t-2") })

    await expect
      .poll(() => deviceEvolu.loadQuery(qerkoTerminalSelectionQuery(accountId)))
      .toEqual([
        { terminalId: "t-2", terminalTid: "tid-t-2", locationName: "Cafe" },
      ])
    await expect(
      deviceEvolu.loadQuery(qerkoTerminalSelectionQuery(otherAccountId))
    ).resolves.toHaveLength(1)
  })

  test("forgets the terminal when cleared", async () => {
    await using test = await createTestDeviceEvolu()
    const { deviceEvolu } = test
    selectQerkoTerminal(deviceEvolu, { accountId, ...terminal("t-1") })
    await expect
      .poll(() => deviceEvolu.loadQuery(qerkoTerminalSelectionQuery(accountId)))
      .toHaveLength(1)

    clearQerkoTerminal(deviceEvolu, accountId)

    await expect
      .poll(() => deviceEvolu.loadQuery(qerkoTerminalSelectionQuery(accountId)))
      .toHaveLength(0)
  })
})
