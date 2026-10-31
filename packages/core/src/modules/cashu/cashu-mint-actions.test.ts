import {
  createOwnerWebSocketTransport,
  createWebSocket,
  sqliteFalse,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { loadCashuWallet } from "../../cashu/cashu-wallet.ts"
import type { AppOwnerSyncState } from "../../deps.ts"
import { createQuery, type Evolu } from "../../evolu/schema.ts"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import {
  createCashuTest,
  storeTestCashuProofs,
  testCashuBalances,
  testMintUrl,
} from "../../testing/cashu.ts"
import { createTestRelay } from "../../testing/evolu-relay.ts"
import { saveCashuAccount } from "../account/account-actions.ts"
import { createCashuAccountId } from "../account/account-utils.ts"
import { createPayment } from "../payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "../payment/payment-preparation-actions.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonEmptyString255, NonNegativeInteger } from "../shared/schema.ts"
import {
  loadDefaultCashuMint,
  seedCashuMintIfDue,
  seedCashuMintOnConfirm,
  setDefaultCashuMint,
  trustCashuMint,
  untrustCashuMint,
} from "./cashu-mint-actions.ts"
import { cashuTrustedMintsQuery } from "./cashu-queries.ts"
import { MintUrl } from "./cashu-types.ts"
import {
  CashuTrustedMintsJson,
  cashuMintTrustId,
  MAIN_MINT_URL,
  pickDefaultCashuMint,
  trustedCashuMintsOf,
} from "./cashu-utils.ts"

const extra = MintUrl("https://extra.mint.test")

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

const trustedOf = async (evolu: Evolu) =>
  trustedCashuMintsOf(await evolu.loadQuery(cashuTrustedMintsQuery))

const trustedMints = (t: CashuTest) => trustedOf(t.deps.evolu)

const defaultMint = async (t: CashuTest) =>
  pickDefaultCashuMint(await trustedMints(t))

describe("the default mint", () => {
  test("enabling Cashu seeds MAIN_MINT_URL once, and enabling again keeps the merchant's choice", async () => {
    await using t = await createCashuTest({
      defaultMint: null,
      extraMints: [{ url: extra }],
    })
    await using run = testCreateRun(t.deps)
    expect(await trustedMints(t)).toEqual([])

    await run.ok(saveCashuAccount({ enabled: true }))
    expect(await t.deps.evolu.loadQuery(cashuTrustedMintsQuery)).toEqual([
      { trustedMintsJson: null, seedMintUrl: MAIN_MINT_URL },
    ])

    await run.orThrow(trustCashuMint(extra))
    await run.orThrow(setDefaultCashuMint(extra))
    await run.ok(saveCashuAccount({ enabled: false }))
    await run.ok(saveCashuAccount({ enabled: true }))

    expect(await defaultMint(t)).toBe(extra)
    expect(await trustedMints(t)).toEqual([extra, MAIN_MINT_URL])
  })

  test("only a trusted mint becomes the default", async () => {
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)

    const refused = await run(setDefaultCashuMint(extra))
    expect(!refused.ok && refused.error.type).toBe("CashuMintNotTrusted")
    expect(await defaultMint(t)).toBe(testMintUrl)

    await run.orThrow(trustCashuMint(extra))
    await run.orThrow(setDefaultCashuMint(extra))
    expect(await defaultMint(t)).toBe(extra)
  })
})

describe("a device that knows no trusted mint (cashu/0018)", () => {
  const allMintRows = (t: CashuTest) =>
    t.deps.evolu.loadQuery(
      createQuery((db) => db.selectFrom("cashuMintTrust").select(["id"]))
    )

  test("chooses no mint for payments, MAIN_MINT_URL included, and writes nothing", async () => {
    await using t = await createCashuTest({
      defaultMint: null,
      extraMints: [{ url: MAIN_MINT_URL }],
    })
    await using run = testCreateRun(t.deps)

    const refused = await run(setDefaultCashuMint(MAIN_MINT_URL))

    expect(!refused.ok && refused.error.type).toBe("CashuMintsNotSynced")
    expect(await allMintRows(t)).toEqual([])
  })

  test("untrusts nothing, and writes nothing", async () => {
    await using t = await createCashuTest({
      defaultMint: null,
      extraMints: [{ url: MAIN_MINT_URL }],
    })
    await using run = testCreateRun(t.deps)

    const refused = await run(untrustCashuMint(MAIN_MINT_URL))

    expect(!refused.ok && refused.error.type).toBe("CashuMintsNotSynced")
    expect(await allMintRows(t)).toEqual([])
  })

  test("trusts no mint either, and writes nothing: its list would replace the merchant's (cashu/0013)", async () => {
    await using t = await createCashuTest({
      defaultMint: null,
      extraMints: [{ url: extra }],
    })
    await using run = testCreateRun(t.deps)

    const refused = await run(trustCashuMint(extra))

    expect(!refused.ok && refused.error.type).toBe("CashuMintsNotSynced")
    expect(await allMintRows(t)).toEqual([])
  })
})

describe("trusting mints", () => {
  test("trusts a mint that loads, without changing the default", async () => {
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)

    expect(await run(trustCashuMint("extra.mint.test"))).toEqual({
      ok: true,
      value: extra,
    })
    expect(await trustedMints(t)).toEqual([testMintUrl, extra])
    expect(await defaultMint(t)).toBe(testMintUrl)
  })

  test("refuses a mint that does not load", async () => {
    await using t = await createCashuTest()
    await using run = testCreateRun(t.deps)
    const result = await run(trustCashuMint("down.mint.test"))
    expect(!result.ok && result.error.type).toBe("MintUnreachable")
    expect(await trustedMints(t)).toEqual([testMintUrl])
  })

  test("refuses a mint that loaded before and does not load now, never trusting a kept snapshot", async () => {
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)
    await run.orThrow(loadCashuWallet(extra))
    const [down] = t.others
    for (const endpoint of ["info", "keysets", "keys"] as const)
      for (let i = 0; i < 3; i++)
        down?.failNext(endpoint, { type: "unreachable" })

    const result = await run(trustCashuMint("extra.mint.test"))

    expect(!result.ok && result.error.type).toBe("MintUnreachable")
    expect(await trustedMints(t)).toEqual([testMintUrl])
  })

  test.each([
    { nut: 7, options: { supportsNut07: false } },
    { nut: 9, options: { supportsNut09: false } },
  ])(
    "refuses a mint that does not list NUT-0$nut (cashu/0033)",
    async ({ nut, options }) => {
      await using t = await createCashuTest({
        extraMints: [{ url: extra, ...options }],
      })
      await using run = testCreateRun(t.deps)

      const result = await run(trustCashuMint("extra.mint.test"))

      expect(!result.ok && result.error).toMatchObject({
        type: "CashuMintUnsupported",
        missingNuts: [nut],
      })
      expect(await trustedMints(t)).toEqual([testMintUrl])
    }
  )

  test("a mint named only by proofs or operations is not trusted", async () => {
    await using t = await createCashuTest()
    await storeTestCashuProofs(t.deps.evolu, [
      {
        mintUrl: MintUrl("https://proof.mint.test"),
        keysetId: "00aa",
        amount: 1,
        secret: "s",
        state: "spent",
      },
    ])

    expect(await trustedMints(t)).toEqual([testMintUrl])
  })

  test("untrusting a mint with a balance keeps the balance", async () => {
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)
    await run.orThrow(trustCashuMint(extra))
    await storeTestCashuProofs(t.deps.evolu, [
      { mintUrl: extra, keysetId: "00aa", amount: 21, secret: "s" },
    ])

    expect(await run(untrustCashuMint(extra))).toEqual({
      ok: true,
      value: testMintUrl,
    })
    expect(await trustedMints(t)).toEqual([testMintUrl])
    expect((await testCashuBalances(t.deps.evolu)).get(extra)).toBe(21)
  })

  test("untrusting the default hands it to the previous choice, which it returns", async () => {
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)
    await run.orThrow(trustCashuMint(extra))
    await run.orThrow(setDefaultCashuMint(extra))

    expect(await run(untrustCashuMint(extra))).toEqual({
      ok: true,
      value: testMintUrl,
    })
    expect(await defaultMint(t)).toBe(testMintUrl)
  })

  test("enabling Cashu again keeps an untrusted MAIN_MINT_URL untrusted", async () => {
    await using t = await createCashuTest({
      defaultMint: null,
      extraMints: [{ url: extra }],
    })
    await using run = testCreateRun(t.deps)
    await run.ok(saveCashuAccount({ enabled: true }))
    await run.orThrow(trustCashuMint(extra))
    await run.orThrow(untrustCashuMint(MAIN_MINT_URL))

    await run.ok(saveCashuAccount({ enabled: false }))
    await run.ok(saveCashuAccount({ enabled: true }))

    expect(await trustedMints(t)).toEqual([extra])
  })

  test("the last trusted mint cannot be untrusted", async () => {
    await using t = await createCashuTest()
    await using run = testCreateRun(t.deps)

    const refused = await run(untrustCashuMint(testMintUrl))
    expect(!refused.ok && refused.error.type).toBe("CashuLastTrustedMint")
    expect(await trustedMints(t)).toEqual([testMintUrl])
  })

  test("trusting a mint again keeps the default where it is", async () => {
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)
    await run.orThrow(trustCashuMint(extra))
    await run.orThrow(setDefaultCashuMint(extra))
    await run.orThrow(setDefaultCashuMint(testMintUrl))
    await run.orThrow(untrustCashuMint(extra))
    await run.orThrow(trustCashuMint(extra))

    expect(await defaultMint(t)).toBe(testMintUrl)
  })

  test("trusting the last choice again after untrusting it keeps the default where it is", async () => {
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)
    await run.orThrow(trustCashuMint(extra))
    await run.orThrow(setDefaultCashuMint(extra))
    await run.orThrow(untrustCashuMint(extra))
    await run.orThrow(trustCashuMint(extra))

    expect(await defaultMint(t)).toBe(testMintUrl)
  })
})

const second = MintUrl("https://second.mint.test")

/** Each device's database syncing its owner through the relay. */
const syncThrough = (url: string, ...databases: ReadonlyArray<Evolu>) => {
  for (const evolu of databases)
    evolu.useOwner(evolu.appOwner, [
      createOwnerWebSocketTransport({ url, ownerId: evolu.appOwner.id }),
    ])
}

const defaultOf = async (evolu: Evolu) =>
  pickDefaultCashuMint(await trustedOf(evolu))

describe("two devices of one account", () => {
  test("lists changed offline on two devices merge into the later one, whole (cashu/0013)", async () => {
    await using relay = await createTestRelay()
    await using t = await createCashuTest({
      createWebSocket,
      extraMints: [{ url: extra }, { url: second }],
    })
    const other = await t.otherDevice()
    await using runA = testCreateRun(t.deps)
    await using runB = testCreateRun(other)
    await runA.orThrow(trustCashuMint(extra))
    await runA.orThrow(setDefaultCashuMint(extra))
    // Evolu orders writes by a millisecond clock; B's is the later list.
    await new Promise((resolve) => setTimeout(resolve, 5))
    await runB.orThrow(trustCashuMint(second))
    await runB.orThrow(setDefaultCashuMint(second))

    syncThrough(relay.url, t.deps.evolu, other.evolu)

    // B's list stands as B wrote it: A's trust of `extra` is the change lost.
    for (const evolu of [t.deps.evolu, other.evolu])
      await expect
        .poll(() => trustedOf(evolu), { timeout: 15_000, interval: 200 })
        .toEqual([second, testMintUrl])
  }, 30_000)

  test("a device that has the Cashu account but not yet its mints overrides neither the default nor trust", async () => {
    await using relay = await createTestRelay()
    await using t = await createCashuTest({
      createWebSocket,
      defaultMint: null,
      extraMints: [{ url: MAIN_MINT_URL }],
    })
    const other = await t.otherDevice()
    await using runA = testCreateRun({
      ...t.deps,
      date: { now: () => new Date(1_000) },
    })
    await runA.ok(saveCashuAccount({ enabled: true }))
    await runA.orThrow(trustCashuMint(testMintUrl))
    await runA.orThrow(setDefaultCashuMint(testMintUrl))
    await runA.orThrow(untrustCashuMint(MAIN_MINT_URL))

    // B, later, has synced the Cashu account but none of the mints yet.
    const depsB = {
      ...other,
      date: { now: () => new Date(2_000) },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith(MAIN_MINT_URL)
          ? other.fetch(input, init)
          : new Response(
              JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
            ),
      ...createYadioApiDep(),
    }
    const accountId = createCashuAccountId()
    await runMutationWithCompletion((options) => {
      other.evolu.upsert("accountCashu", { id: accountId }, options)
      other.evolu.upsert(
        "account",
        {
          id: accountId,
          deviceId: null,
          name: NonEmptyString255("Cashu"),
          kind: "cashu",
          isDeleted: sqliteFalse,
        },
        options
      )
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await using runB = testCreateRun(depsB)
    const paymentId = await runB.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )
    // Its payment quotes nothing (cashu/0018); enabling Cashu again seeds.
    const prepared = await runB(
      prepareCashuPaymentMethod({ paymentId, accountId })
    )
    expect(!prepared.ok && prepared.error.type).toBe("CashuMintsNotSynced")
    await runB.ok(saveCashuAccount({ enabled: true }))

    syncThrough(relay.url, t.deps.evolu, other.evolu)

    for (const evolu of [t.deps.evolu, other.evolu]) {
      await expect
        .poll(() => trustedOf(evolu), { timeout: 15_000, interval: 200 })
        .toEqual([testMintUrl])
      expect(await defaultOf(evolu)).toBe(testMintUrl)
    }
  }, 30_000)

  test("enabling Cashu on a device without the mints does not demote MAIN_MINT_URL chosen again", async () => {
    await using relay = await createTestRelay()
    await using t = await createCashuTest({
      createWebSocket,
      defaultMint: null,
      extraMints: [{ url: MAIN_MINT_URL }],
    })
    const other = await t.otherDevice()
    await using runA = testCreateRun({
      ...t.deps,
      date: { now: () => new Date(1_000) },
    })
    // A: the seed, then the merchant chooses another mint and MAIN again.
    await runA.ok(saveCashuAccount({ enabled: true }))
    await runA.orThrow(trustCashuMint(testMintUrl))
    await runA.orThrow(setDefaultCashuMint(testMintUrl))
    await runA.orThrow(setDefaultCashuMint(MAIN_MINT_URL))

    // B, later, has the Cashu account but none of the mints: it takes a
    // payment and enables Cashu again, seeding MAIN.
    const depsB = {
      ...other,
      date: { now: () => new Date(2_000) },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith(MAIN_MINT_URL)
          ? other.fetch(input, init)
          : new Response(
              JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
            ),
      ...createYadioApiDep(),
    }
    const accountId = createCashuAccountId()
    await runMutationWithCompletion((options) => {
      other.evolu.upsert("accountCashu", { id: accountId }, options)
      other.evolu.upsert(
        "account",
        {
          id: accountId,
          deviceId: null,
          name: NonEmptyString255("Cashu"),
          kind: "cashu",
          isDeleted: sqliteFalse,
        },
        options
      )
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await using runB = testCreateRun(depsB)
    const paymentId = await runB.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )
    // Its payment quotes nothing (cashu/0018); enabling Cashu again seeds.
    const prepared = await runB(
      prepareCashuPaymentMethod({ paymentId, accountId })
    )
    expect(!prepared.ok && prepared.error.type).toBe("CashuMintsNotSynced")
    await runB.ok(saveCashuAccount({ enabled: true }))

    syncThrough(relay.url, t.deps.evolu, other.evolu)

    for (const evolu of [t.deps.evolu, other.evolu]) {
      await expect
        .poll(() => trustedOf(evolu), { timeout: 15_000, interval: 200 })
        .toEqual([MAIN_MINT_URL, testMintUrl])
      expect(await defaultOf(evolu)).toBe(MAIN_MINT_URL)
    }
  }, 30_000)
})

describe("no merge leaves no mint trusted (cashu/0013)", () => {
  test("untrusts made on two devices at once leave one device's list, never none", async () => {
    await using relay = await createTestRelay()
    await using t = await createCashuTest({
      createWebSocket,
      extraMints: [{ url: extra }],
    })
    const other = await t.otherDevice()
    await using runA = testCreateRun(t.deps)
    await using runB = testCreateRun(other)
    await runA.orThrow(trustCashuMint(extra))
    await runB.orThrow(trustCashuMint(extra))
    await new Promise((resolve) => setTimeout(resolve, 5))
    // Offline: A untrusts the default, handing it to `extra`; B, later,
    // untrusts `extra`. Each device keeps one mint trusted.
    expect(await runA.orThrow(untrustCashuMint(testMintUrl))).toBe(extra)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(await runB.orThrow(untrustCashuMint(extra))).toBe(testMintUrl)

    syncThrough(relay.url, t.deps.evolu, other.evolu)

    // The later list stands whole on both: A's untrust is the one undone.
    for (const evolu of [t.deps.evolu, other.evolu])
      await expect
        .poll(() => trustedOf(evolu), { timeout: 15_000, interval: 200 })
        .toEqual([testMintUrl])
  }, 30_000)
})

describe("the seed waits for this device's sync (cashu/0013)", () => {
  /** A device of an account whose sync the test completes when it says. */
  const unsyncedDevice = async () => {
    const t = await createCashuTest({
      defaultMint: null,
      extraMints: [{ url: MAIN_MINT_URL }, { url: extra }],
    })
    const sync: { state: AppOwnerSyncState } = { state: { type: "pending" } }
    const deps = { ...t.deps, appOwnerSync: { state: () => sync.state } }
    return { t, sync, deps }
  }

  const seedRows = (evolu: Evolu) =>
    evolu.loadQuery(
      createQuery((db) =>
        db.selectFrom("cashuMintTrust").select(["seedMintUrl"])
      )
    )

  test("enabling Cashu before this device synced seeds nothing, and no payment is quoted", async () => {
    const { t, deps } = await unsyncedDevice()
    await using _ = t
    await using run = testCreateRun(deps)

    await run.ok(saveCashuAccount({ enabled: true }))

    expect(await seedRows(t.deps.evolu)).toEqual([])
    const quoted = await run(loadDefaultCashuMint)
    expect(!quoted.ok && quoted.error.type).toBe("CashuMintsNotSynced")
    expect(await run.ok(seedCashuMintIfDue)).toBe(false)
  })

  test("once synced, the seed is written then, a restart in between losing nothing", async () => {
    const { t, sync, deps } = await unsyncedDevice()
    await using _ = t
    {
      await using run = testCreateRun(deps)
      await run.ok(saveCashuAccount({ enabled: true }))
    }

    // A restart: nothing but the database carries over.
    sync.state = { type: "complete" }
    await using restarted = testCreateRun({ ...deps })

    expect(await restarted.ok(seedCashuMintIfDue)).toBe(true)
    expect(await trustedMints(t)).toEqual([MAIN_MINT_URL])
    expect(await restarted.ok(seedCashuMintIfDue)).toBe(false)
  })

  test("the merchant's list arriving before the sync completes leaves nothing to seed", async () => {
    const { t, sync, deps } = await unsyncedDevice()
    await using _ = t
    await using run = testCreateRun(deps)
    await run.ok(saveCashuAccount({ enabled: true }))
    await runMutationWithCompletion((options) =>
      t.deps.evolu.upsert(
        "cashuMintTrust",
        {
          id: cashuMintTrustId,
          trustedMintsJson: z.encode(CashuTrustedMintsJson, [extra]),
        },
        options
      )
    )

    sync.state = { type: "complete" }

    expect(await run.ok(seedCashuMintIfDue)).toBe(false)
    expect(await seedRows(t.deps.evolu)).toEqual([{ seedMintUrl: null }])
    expect(await trustedMints(t)).toEqual([extra])
  })

  test("a list this device cannot decode is never seeded over, pass after pass", async () => {
    const { t, sync, deps } = await unsyncedDevice()
    await using _ = t
    sync.state = { type: "complete" }
    await runMutationWithCompletion((options) =>
      t.deps.evolu.upsert(
        "cashuMintTrust",
        { id: cashuMintTrustId, trustedMintsJson: '["not a mint url"]' },
        options
      )
    )
    await using run = testCreateRun(deps)

    expect(await run.ok(seedCashuMintIfDue)).toBe(false)
    expect(await run.ok(seedCashuMintIfDue)).toBe(false)
    expect(await seedRows(t.deps.evolu)).toEqual([{ seedMintUrl: null }])
  })

  test("enabling Cashu on a device that has synced seeds at once", async () => {
    const { t, sync, deps } = await unsyncedDevice()
    await using _ = t
    sync.state = { type: "complete" }
    await using run = testCreateRun(deps)

    await run.ok(saveCashuAccount({ enabled: true }))

    expect(await trustedMints(t)).toEqual([MAIN_MINT_URL])
  })
})

describe("a blocked sync is seeded only on the merchant's word (cashu/0013)", () => {
  const blocked: AppOwnerSyncState = {
    type: "blocked",
    unreachable: ["wss://down.example"],
  }
  const deviceWith = async (state: AppOwnerSyncState) => {
    const t = await createCashuTest({
      defaultMint: null,
      extraMints: [{ url: MAIN_MINT_URL }, { url: extra }],
    })
    const deps = { ...t.deps, appOwnerSync: { state: () => state } }
    return { t, deps }
  }

  test("a relay that cannot be reached seeds nothing on its own, and no payment is quoted", async () => {
    const { t, deps } = await deviceWith(blocked)
    await using _ = t
    await using run = testCreateRun(deps)

    await run.ok(saveCashuAccount({ enabled: true }))

    expect(await run.ok(seedCashuMintIfDue)).toBe(false)
    const quoted = await run(loadDefaultCashuMint)
    expect(!quoted.ok && quoted.error.type).toBe("CashuMintsNotSynced")
  })

  test("the merchant's confirmation seeds the default mint, and a list that arrives later still wins", async () => {
    const { t, deps } = await deviceWith(blocked)
    await using _ = t
    await using run = testCreateRun(deps)
    await run.ok(saveCashuAccount({ enabled: true }))

    expect(await run.orThrow(seedCashuMintOnConfirm)).toBe(true)
    expect(await run.orThrow(loadDefaultCashuMint)).toBe(MAIN_MINT_URL)

    // The relay comes back with the list the merchant wrote elsewhere.
    await runMutationWithCompletion((options) =>
      t.deps.evolu.upsert(
        "cashuMintTrust",
        {
          id: cashuMintTrustId,
          trustedMintsJson: z.encode(CashuTrustedMintsJson, [extra]),
        },
        options
      )
    )

    expect(await trustedMints(t)).toEqual([extra])
    expect(await run.orThrow(seedCashuMintOnConfirm)).toBe(false)
  })

  test("the confirmation is refused while a relay is still on its way", async () => {
    const { t, deps } = await deviceWith({ type: "pending" })
    await using _ = t
    await using run = testCreateRun(deps)
    await run.ok(saveCashuAccount({ enabled: true }))

    const seeded = await run(seedCashuMintOnConfirm)

    expect(!seeded.ok && seeded.error.type).toBe("CashuMintsStillSyncing")
    expect(await trustedMints(t)).toEqual([])
  })
})
