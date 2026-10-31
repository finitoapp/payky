import {
  createIdFromString,
  createOwnerWebSocketTransport,
} from "@evolu/common"
import { describe, expect, test } from "vitest"
import { runMutationWithCompletion } from "../modules/shared/evolu-utils.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  PositiveInteger,
} from "../modules/shared/schema.ts"
import { createEvoluTest } from "../testing/evolu.ts"
import { createTestRelay } from "../testing/evolu-relay.ts"
import {
  awaitSyncRound,
  createSwitchableWebSocket,
} from "../testing/evolu-sync.ts"
import { createQuery } from "./schema.ts"

/**
 * `patches/@evolu%2Fcommon@*.patch` adds `evolu.setMutationBackdate`, which the
 * demo-data generator stamps its history with (docs/decisions/demo-data/0001)
 * and the Cashu simulation its devices' writes
 * (packages/core/src/testing/cashu-simulation.ts).
 * An Evolu upgrade that drops the patch fails here first.
 */
describe("evolu backdate patch", () => {
  test("stamps createdAt in the past, also jumping back, and leaves later writes on the real clock", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const past = Date.parse("2026-01-15T12:00:00.000Z")
    const insertTable = (name: string) =>
      runMutationWithCompletion(
        (options) =>
          evolu.insert(
            "table",
            {
              name: NonEmptyString255(name),
              code: NonEmptyString255(name),
              seatCount: PositiveInteger(4),
              sortOrder: NonNegativeInteger(0),
            },
            options
          ).id
      )

    evolu.setMutationBackdate(past)
    const first = await insertTable("A")
    // The same millis again stays unique: a duplicate timestamp would be
    // dropped as already applied.
    const second = await insertTable("B")
    // Back to an earlier, unwritten day, as the generator does day by day.
    evolu.setMutationBackdate(past - 24 * 3_600_000)
    const earlier = await insertTable("B2")
    evolu.setMutationBackdate(null)
    const now = await insertTable("C")

    const rows = await evolu.loadQuery(
      createQuery((db) =>
        db.selectFrom("table").select(["id", "createdAt"]).orderBy("name")
      )
    )

    expect(rows.map((row) => row.id)).toEqual([first, second, earlier, now])
    expect(rows[0]?.createdAt).toBe("2026-01-15T12:00:00.000Z")
    expect(rows[1]?.createdAt).toBe("2026-01-15T12:00:00.000Z")
    expect(rows[2]?.createdAt).toBe("2026-01-14T12:00:00.000Z")
    expect(Date.parse(rows[3]?.createdAt ?? "")).toBeGreaterThan(
      Date.now() - 60_000
    )
  })

  test("orders the writes of two synced instances of one owner as they were made, whatever their nodes", async () => {
    await using relay = await createTestRelay()
    const open = async () => {
      const network = createSwitchableWebSocket()
      const device = await createEvoluTest({
        createWebSocket: network.createWebSocket,
      })
      device.evolu.useOwner(device.evolu.appOwner, [
        createOwnerWebSocketTransport({
          url: relay.url,
          ownerId: device.evolu.appOwner.id,
        }),
      ])
      return device
    }
    await using a = await open()
    await using b = await open()
    const at = Date.parse("2026-01-15T12:00:00.000Z")
    const id = createIdFromString<"Table">("shared")
    const nameQuery = createQuery((db) =>
      db.selectFrom("table").select(["name", "createdAt"]).where("id", "=", id)
    )
    const rename = (device: typeof a, name: string) =>
      runMutationWithCompletion((options) =>
        device.evolu.upsert(
          "table",
          {
            id,
            name: NonEmptyString255(name),
            code: NonEmptyString255("T"),
            seatCount: PositiveInteger(4),
            sortOrder: NonNegativeInteger(0),
          },
          { ...options, owner: device.evolu.appOwner }
        )
      )
    a.evolu.setMutationBackdate(at)
    b.evolu.setMutationBackdate(at)

    // Both write the same cell at the same millis, apart: a tie on millis
    // alone would go to whichever node id sorts higher, at random.
    for (const [first, second] of [
      [a, b],
      [b, a],
      [a, b],
      [b, a],
      [a, b],
    ] as const) {
      await rename(first, "first")
      await rename(second, "second")
      for (const device of [a, b, a, b]) await awaitSyncRound(device)
      for (const device of [a, b])
        expect(await device.evolu.loadQuery(nameQuery)).toEqual([
          { name: "second", createdAt: "2026-01-15T12:00:00.000Z" },
        ])
    }
  }, 30_000)
})
