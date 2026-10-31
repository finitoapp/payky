import { createOwnerWebSocketTransport } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { createQuery, type Evolu } from "../evolu/schema.ts"
import { MintUrl } from "../modules/cashu/cashu-types.ts"
import {
  CashuTrustedMintsJson,
  cashuMintTrustId,
} from "../modules/cashu/cashu-utils.ts"
import { runMutationWithCompletion } from "../modules/shared/evolu-utils.ts"
import { createEvoluTest } from "./evolu.ts"
import { createTestRelay } from "./evolu-relay.ts"
import { awaitSyncRound, createSwitchableWebSocket } from "./evolu-sync.ts"

const trustQuery = createQuery((db) =>
  db.selectFrom("cashuMintTrust").select(["trustedMintsJson"])
)

const trusted = async (evolu: Evolu) =>
  (await evolu.loadQuery(trustQuery)).map((row) => row.trustedMintsJson)

const writeTrust = (evolu: Evolu, mint: string) =>
  runMutationWithCompletion((options) =>
    evolu.upsert(
      "cashuMintTrust",
      {
        id: cashuMintTrustId,
        trustedMintsJson: z.encode(CashuTrustedMintsJson, [MintUrl(mint)]),
      },
      { ...options, owner: evolu.appOwner }
    )
  )

const openDevice = async (relayUrl: string) => {
  const network = createSwitchableWebSocket()
  const device = await createEvoluTest({
    createWebSocket: network.createWebSocket,
  })
  device.evolu.useOwner(device.evolu.appOwner, [
    createOwnerWebSocketTransport({
      url: relayUrl,
      ownerId: device.evolu.appOwner.id,
    }),
  ])
  return { ...device, network }
}

describe("controlled sync through a test relay", () => {
  test("a sync round is awaited to completion on both sides, and an offline device catches up once back", async () => {
    await using relay = await createTestRelay()
    await using a = await openDevice(relay.url)
    await using b = await openDevice(relay.url)
    const round = async () => {
      const online = [a, b].filter((device) => device.network.online)
      // The first pass puts every device's writes on the relay, the second
      // brings each device what the others put there.
      for (const device of online) await awaitSyncRound(device)
      for (const device of online) await awaitSyncRound(device)
    }

    await writeTrust(a.evolu, "https://one.test")
    await round()
    expect(await trusted(b.evolu)).toEqual([
      z.encode(CashuTrustedMintsJson, [MintUrl("https://one.test")]),
    ])

    b.network.setOnline(false)
    await writeTrust(a.evolu, "https://two.test")
    await round()
    // B is offline: nothing of A's later write reached it.
    expect(await trusted(b.evolu)).toEqual([
      z.encode(CashuTrustedMintsJson, [MintUrl("https://one.test")]),
    ])

    await new Promise((resolve) => setTimeout(resolve, 2))
    await writeTrust(b.evolu, "https://three.test")
    b.network.setOnline(true)
    await round()
    // B's write is the later one, and both devices hold it.
    const expected = [
      z.encode(CashuTrustedMintsJson, [MintUrl("https://three.test")]),
    ]
    expect(await trusted(a.evolu)).toEqual(expected)
    expect(await trusted(b.evolu)).toEqual(expected)
  }, 30_000)

  test("rounds are fast enough to run between every step of a scenario", async () => {
    await using relay = await createTestRelay()
    await using a = await openDevice(relay.url)
    await using b = await openDevice(relay.url)
    const started = performance.now()
    for (let index = 0; index < 20; index += 1) {
      await writeTrust(
        index % 2 === 0 ? a.evolu : b.evolu,
        `https://m${index}.test`
      )
      if (index % 5 === 0) b.network.setOnline(!b.network.online)
      for (const device of [a, b].filter((d) => d.network.online))
        await awaitSyncRound(device)
      for (const device of [a, b].filter((d) => d.network.online))
        await awaitSyncRound(device)
    }
    b.network.setOnline(true)
    for (const device of [a, b]) await awaitSyncRound(device)
    for (const device of [a, b]) await awaitSyncRound(device)
    const elapsed = performance.now() - started
    expect(await trusted(a.evolu)).toEqual(await trusted(b.evolu))
    console.info(`20 steps with sync rounds: ${elapsed.toFixed(0)} ms`)
  }, 60_000)
})
