import { describe, expect, test } from "vitest"

import { setupRunWithEvoluDeps } from "@/core/evolu/cli-client.ts"
import {
  activeAccountQuery,
  appOwnerIdPlaceholder,
  createOrSelectAccount,
  createOrSelectStationAccount,
  defaultEvoluTransportUrls,
  resolveTransportUrl,
} from "@/core/evolu/device-account.ts"
import { createDeviceEvolu } from "@/core/evolu/device-client.ts"
import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { NostrPubkeyHex } from "@/core/modules/shared/schema.ts"

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

describe("createOrSelectStationAccount", () => {
  const stationKey = MasterKey("0f0e0d0c0b0a09080706050403020100")
  const ownerPubkey = NostrPubkeyHex("ab".repeat(32))

  test("opens a station as an account of its own, trusting its owner", async () => {
    await using setup = await setupRunWithEvoluDeps("memory")
    await using deviceEvolu = await setup.run.ok(createDeviceEvolu)
    await createOrSelectAccount(
      deviceEvolu,
      MasterKey("000102030405060708090a0b0c0d0e0f")
    )

    const opened = await createOrSelectStationAccount(deviceEvolu, {
      masterKey: stationKey,
      ownerPubkey,
    })

    expect(opened.created).toBe(true)
    await expect
      .poll(() => deviceEvolu.loadQuery(activeAccountQuery))
      .toMatchObject([
        {
          id: opened.accountId,
          masterKey: stationKey,
          kind: "station",
          stationOwnerPubkey: ownerPubkey,
        },
      ])
  })

  test("selects the account a link made before", async () => {
    await using setup = await setupRunWithEvoluDeps("memory")
    await using deviceEvolu = await setup.run.ok(createDeviceEvolu)
    const first = await createOrSelectStationAccount(deviceEvolu, {
      masterKey: stationKey,
      ownerPubkey,
    })

    expect(
      await createOrSelectStationAccount(deviceEvolu, {
        masterKey: stationKey,
        ownerPubkey,
      })
    ).toEqual({ accountId: first.accountId, created: false })
  })
})
