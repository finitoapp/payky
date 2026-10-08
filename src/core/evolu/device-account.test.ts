import { sqliteFalse, sqliteTrue } from "@evolu/common"
import { describe, expect, test } from "vitest"

import {
  appOwnerIdPlaceholder,
  createOrSelectAccount,
  defaultEvoluTransportUrls,
  deriveDeviceAccountId,
  removeDeviceAccount,
  resolveTransportUrl,
} from "@/core/evolu/device-account.ts"
import {
  type AccountId,
  createDeviceQuery,
  type DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { NonEmptyString255, WssUrl } from "@/core/modules/shared/schema.ts"
import { createTestDeviceEvolu } from "@/test/device-evolu.ts"

// Shaped like a real one: 22 Base64Url characters.
const appOwnerId = "Vu6kLCCtCCwfgw5M7Kq6Fg"

describe("resolveTransportUrl", () => {
  test("substitutes the placeholder with the app owner id", () => {
    expect(
      resolveTransportUrl(
        `wss://live-relay.payky.me/${appOwnerIdPlaceholder}`,
        appOwnerId
      )
    ).toBe(`wss://live-relay.payky.me/${appOwnerId}`)
  })

  test("substitutes it percent-encoded too, so a room is never shared", () => {
    expect(
      resolveTransportUrl(
        "wss://live-relay.payky.me/$%7BappOwnerId%7D",
        appOwnerId
      )
    ).toBe(`wss://live-relay.payky.me/${appOwnerId}`)
  })

  test("leaves a URL without the placeholder alone", () => {
    expect(resolveTransportUrl("wss://evolu.linky.fit", appOwnerId)).toBe(
      "wss://evolu.linky.fit"
    )
  })
})

describe("defaultEvoluTransportUrls", () => {
  test("stores the live relay's room as a placeholder, not as an id", () => {
    const [plainRelay, liveRelay] = defaultEvoluTransportUrls

    expect(plainRelay).toBe("wss://evolu.linky.fit")
    expect(liveRelay).toBe(`wss://live-relay.payky.me/${appOwnerIdPlaceholder}`)
    expect(liveRelay).not.toContain(appOwnerId)
  })

  test("resolve to a room id a relay accepts", () => {
    const [, liveRelay] = defaultEvoluTransportUrls
    const resolved = resolveTransportUrl(liveRelay, appOwnerId)

    expect(resolved.slice("wss://live-relay.payky.me/".length)).toMatch(
      /^[A-Za-z0-9_-]+$/u
    )
  })
})

/** Every account row, removed ones included. */
const loadAccountRows = (deviceEvolu: DeviceEvolu) =>
  deviceEvolu.loadQuery(
    createDeviceQuery((db) =>
      db.selectFrom("account").select(["id", "name", "masterKey", "isDeleted"])
    )
  )

const loadTransportUrls = (deviceEvolu: DeviceEvolu, accountId: AccountId) =>
  deviceEvolu
    .loadQuery(
      createDeviceQuery((db) =>
        db
          .selectFrom("accountEvoluTransport")
          .innerJoin(
            "accountEvoluTransportWebsocket",
            "accountEvoluTransportWebsocket.id",
            "accountEvoluTransport.id"
          )
          .select("accountEvoluTransportWebsocket.url")
          .where("accountEvoluTransport.accountId", "=", accountId)
      )
    )
    .then((rows) => rows.map(({ url }) => url))

const masterKey = MasterKey("000102030405060708090a0b0c0d0e0f")

describe("deriveDeviceAccountId", () => {
  test("is the same for a master key every time, and differs between keys", () => {
    expect(deriveDeviceAccountId(masterKey)).toMatchInlineSnapshot(
      `"6BTqCU03OKZ5KYiV0QDioQ"`
    )
    expect(deriveDeviceAccountId(masterKey)).toBe(
      deriveDeviceAccountId(masterKey)
    )
    expect(
      deriveDeviceAccountId(MasterKey("0f0e0d0c0b0a09080706050403020100"))
    ).not.toBe(deriveDeviceAccountId(masterKey))
  })
})

describe("createOrSelectAccount", () => {
  test("creates a transferred account with its name and stored transports", async () => {
    await using test = await createTestDeviceEvolu()
    const { deviceEvolu } = test
    const transports = [
      WssUrl("wss://custom.example"),
      WssUrl(`wss://room.example/${appOwnerIdPlaceholder}`),
    ]

    const result = await createOrSelectAccount(deviceEvolu, masterKey, {
      name: NonEmptyString255("Shop"),
      transports,
    })

    expect(result).toEqual({
      accountId: deriveDeviceAccountId(masterKey),
      created: true,
    })
    await expect
      .poll(() => loadAccountRows(deviceEvolu))
      .toMatchObject([{ id: result.accountId, name: "Shop", masterKey }])
    expect(await loadTransportUrls(deviceEvolu, result.accountId)).toEqual(
      expect.arrayContaining(transports)
    )
  })

  test("selecting an existing account leaves its name and transports alone", async () => {
    await using test = await createTestDeviceEvolu()
    const { deviceEvolu } = test
    const first = await createOrSelectAccount(deviceEvolu, masterKey, {
      name: NonEmptyString255("Old"),
    })
    await expect.poll(() => loadAccountRows(deviceEvolu)).toHaveLength(1)

    const second = await createOrSelectAccount(deviceEvolu, masterKey, {
      name: NonEmptyString255("Shop"),
      transports: [WssUrl("wss://custom.example")],
    })

    expect(second).toEqual({ accountId: first.accountId, created: false })
    await expect
      .poll(() => loadAccountRows(deviceEvolu))
      .toMatchObject([{ id: first.accountId, name: "Old" }])
    expect(await loadTransportUrls(deviceEvolu, first.accountId)).not.toContain(
      "wss://custom.example"
    )
  })

  test("adding the same account twice at once writes one row", async () => {
    await using test = await createTestDeviceEvolu()
    const { deviceEvolu } = test

    await Promise.all([
      createOrSelectAccount(deviceEvolu, masterKey),
      createOrSelectAccount(deviceEvolu, masterKey),
    ])

    await expect.poll(() => loadAccountRows(deviceEvolu)).toHaveLength(1)
  })

  test("re-adding a removed account revives its row, name and transports", async () => {
    await using test = await createTestDeviceEvolu()
    const { deviceEvolu } = test
    const { accountId } = await createOrSelectAccount(deviceEvolu, masterKey, {
      name: NonEmptyString255("Shop"),
      transports: [WssUrl("wss://custom.example")],
    })
    removeDeviceAccount(deviceEvolu, accountId)
    await expect
      .poll(() => loadAccountRows(deviceEvolu))
      .toMatchObject([{ id: accountId, isDeleted: sqliteTrue }])

    const readded = await createOrSelectAccount(deviceEvolu, masterKey, {
      name: NonEmptyString255("Other"),
    })

    expect(readded).toEqual({ accountId, created: true })
    await expect
      .poll(() => loadAccountRows(deviceEvolu))
      .toMatchObject([{ id: accountId, name: "Shop", isDeleted: sqliteFalse }])
    expect(await loadTransportUrls(deviceEvolu, accountId)).toEqual([
      "wss://custom.example",
    ])
  })
})
