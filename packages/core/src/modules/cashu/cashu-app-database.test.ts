import {
  createIdFromString,
  createOwnerWebSocketTransport,
  createWebSocket,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createQuery, type Evolu } from "../../evolu/schema.ts"
import { createCashuTest } from "../../testing/cashu.ts"
import { createEvoluTest } from "../../testing/evolu.ts"
import { createTestRelay } from "../../testing/evolu-relay.ts"
import { saveCashuAccount } from "../account/account-actions.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import { KeysetId, MintUrl } from "./cashu-types.ts"

const mint = MintUrl("https://mint.test")

const mintsQuery = createQuery((db) =>
  db.selectFrom("cashuMint").select(["mintUrl"])
)

const countersQuery = createQuery((db) =>
  db.selectFrom("_cashuCounter").select(["next"])
)

/** Every synced Cashu row, deleted or not: what would reach a relay. */
const syncedCashuRows = async (evolu: Evolu) => [
  ...(await evolu.loadQuery(
    createQuery((db) => db.selectFrom("cashuMint").select(["id"]))
  )),
  ...(await evolu.loadQuery(
    createQuery((db) => db.selectFrom("cashuProof").select(["id"]))
  )),
  ...(await evolu.loadQuery(
    createQuery((db) => db.selectFrom("cashuOperation").select(["id"]))
  )),
]

const syncThrough = (url: string, ...evolus: ReadonlyArray<Evolu>): void => {
  for (const evolu of evolus)
    evolu.useOwner(evolu.appOwner, [
      createOwnerWebSocketTransport({ url, ownerId: evolu.appOwner.id }),
    ])
}

describe("the Cashu wallet in the app database (cashu/0012)", () => {
  test("two devices of one account sync the wallet through a relay, but not its local counters", async () => {
    await using relay = await createTestRelay()
    await using first = await createEvoluTest({ createWebSocket })
    await using second = await createEvoluTest({ createWebSocket })
    syncThrough(relay.url, first.evolu, second.evolu)

    await runMutationWithCompletion((options) => {
      const owned = { ...options, owner: first.evolu.appOwner }
      first.evolu.upsert(
        "_cashuCounter",
        {
          id: createIdFromString<"CashuCounter">("counter"),
          mintUrl: mint,
          keysetId: KeysetId("00ab"),
          next: NonNegativeInteger(7),
        },
        owned
      )
      first.evolu.upsert(
        "cashuMint",
        { id: createIdFromString<"CashuMint">(mint), mintUrl: mint },
        owned
      )
    })

    await expect
      .poll(() => second.evolu.loadQuery(mintsQuery), {
        timeout: 15_000,
        interval: 200,
      })
      .toEqual([{ mintUrl: mint }])
    expect(await first.evolu.loadQuery(countersQuery)).toEqual([{ next: 7 }])
    expect(await second.evolu.loadQuery(countersQuery)).toEqual([])
  }, 30_000)

  test("an account that never enabled Cashu has no Cashu rows to sync", async () => {
    await using t = await createCashuTest({ defaultMint: null })
    await using run = testCreateRun(t.deps)

    expect(await run.ok(saveCashuAccount({ enabled: false }))).toBeNull()
    expect(await syncedCashuRows(t.deps.evolu)).toEqual([])

    await run.ok(saveCashuAccount({ enabled: true }))
    expect(await syncedCashuRows(t.deps.evolu)).toHaveLength(1)
  })
})
