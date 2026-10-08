import { describe, expect, test } from "vitest"

import {
  appOwnerIdPlaceholder,
  createOrSelectAccount,
  defaultEvoluTransportUrls,
  resolveTransportUrl,
} from "@/core/evolu/device-account.ts"
import type { DeviceEvolu } from "@/core/evolu/device-client.ts"
import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { NonEmptyString255, WssUrl } from "@/core/modules/shared/schema.ts"

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

/** Records what `createOrSelectAccount` writes; `existing` is what it finds. */
const createFakeDeviceEvolu = (existing: ReadonlyArray<object> = []) => {
  const writes: {
    readonly method: string
    readonly table: string
    readonly values: object
  }[] = []
  const record = (method: string) => (table: string, values: object) => {
    writes.push({ method, table, values })
    return { ok: true, value: { id: "account-1" }, id: "account-1" }
  }
  const deviceEvolu = {
    insert: record("insert"),
    upsert: record("upsert"),
    update: record("update"),
    loadQuery: async () => existing,
  } as unknown as DeviceEvolu
  return { deviceEvolu, writes }
}

const masterKey = MasterKey("000102030405060708090a0b0c0d0e0f")

describe("createOrSelectAccount", () => {
  test("creates a transferred account with its name and stored transports", async () => {
    const { deviceEvolu, writes } = createFakeDeviceEvolu()
    const transports = [
      WssUrl("wss://custom.example"),
      WssUrl(`wss://room.example/${appOwnerIdPlaceholder}`),
    ]

    const result = await createOrSelectAccount(deviceEvolu, masterKey, {
      name: NonEmptyString255("Shop"),
      transports,
    })

    expect(result.created).toBe(true)
    expect(writes[0]).toMatchObject({
      method: "insert",
      table: "account",
      values: { name: "Shop", masterKey },
    })
    expect(
      writes
        .filter(({ table }) => table === "accountEvoluTransportWebsocket")
        .map(({ values }) => values)
    ).toMatchObject(transports.map((url) => ({ url })))
  })

  test("selecting an existing account leaves its name and transports alone", async () => {
    const { deviceEvolu, writes } = createFakeDeviceEvolu([
      { id: "account-0", masterKey, name: "Old" },
    ])

    const result = await createOrSelectAccount(deviceEvolu, masterKey, {
      name: NonEmptyString255("Shop"),
      transports: [WssUrl("wss://custom.example")],
    })

    expect(result).toEqual({ accountId: "account-0", created: false })
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      method: "update",
      table: "account",
      values: { id: "account-0" },
    })
    expect(writes[0]?.values).not.toHaveProperty("name")
  })
})
