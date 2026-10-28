import {
  createOwnerWebSocketTransport,
  createWebSocket,
  sqliteFalse,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { Evolu } from "../../evolu/schema.ts"
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
  setDefaultCashuMint,
  trustCashuMint,
  untrustCashuMint,
} from "./cashu-mint-actions.ts"
import { cashuTrustedMintsQuery } from "./cashu-queries.ts"
import { MintUrl } from "./cashu-types.ts"
import {
  MAIN_MINT_URL,
  orderTrustedCashuMints,
  pickDefaultCashuMint,
} from "./cashu-utils.ts"

const extra = MintUrl("https://extra.mint.test")

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

const trustedMints = async (t: CashuTest) =>
  orderTrustedCashuMints(await t.deps.evolu.loadQuery(cashuTrustedMintsQuery))

const defaultMint = async (t: CashuTest) =>
  pickDefaultCashuMint(await t.deps.evolu.loadQuery(cashuTrustedMintsQuery))
    .mintUrl

describe("the default mint", () => {
  test("enabling Cashu seeds MAIN_MINT_URL once, and enabling again keeps the merchant's choice", async () => {
    await using t = await createCashuTest({
      defaultMint: null,
      extraMints: [{ url: extra }],
    })
    await using run = testCreateRun(t.deps)
    expect(await trustedMints(t)).toEqual([MAIN_MINT_URL])

    await run.ok(saveCashuAccount({ enabled: true }))
    expect(await t.deps.evolu.loadQuery(cashuTrustedMintsQuery)).toEqual([
      expect.objectContaining({
        mintUrl: MAIN_MINT_URL,
        defaultedAt: expect.any(Number),
      }),
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

  test("untrusting the default writes the hand-off as a choice", async () => {
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)
    await run.orThrow(trustCashuMint(extra))

    await run.orThrow(untrustCashuMint(testMintUrl))

    expect(
      pickDefaultCashuMint(await t.deps.evolu.loadQuery(cashuTrustedMintsQuery))
    ).toEqual({ mintUrl: extra, chosen: true })
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
  pickDefaultCashuMint(await evolu.loadQuery(cashuTrustedMintsQuery)).mintUrl

describe("two devices of one account", () => {
  test("different defaults chosen offline merge into the newer one", async () => {
    await using relay = await createTestRelay()
    await using t = await createCashuTest({
      createWebSocket,
      extraMints: [{ url: extra }, { url: second }],
    })
    const other = await t.otherDevice()
    await using runA = testCreateRun({
      ...t.deps,
      date: { now: () => new Date(1_000) },
    })
    await using runB = testCreateRun({
      ...other,
      date: { now: () => new Date(2_000) },
    })
    await runA.orThrow(trustCashuMint(extra))
    await runA.orThrow(setDefaultCashuMint(extra))
    await runB.orThrow(trustCashuMint(second))
    await runB.orThrow(setDefaultCashuMint(second))

    syncThrough(relay.url, t.deps.evolu, other.evolu)

    for (const evolu of [t.deps.evolu, other.evolu])
      await expect
        .poll(() => defaultOf(evolu), { timeout: 15_000, interval: 200 })
        .toBe(second)
    expect(
      orderTrustedCashuMints(
        await t.deps.evolu.loadQuery(cashuTrustedMintsQuery)
      )
    ).toEqual([second, extra, testMintUrl])
  }, 30_000)

  test("an untrust on one device beats a choice of the same mint on the other", async () => {
    await using relay = await createTestRelay()
    await using t = await createCashuTest({
      createWebSocket,
      extraMints: [{ url: extra }],
    })
    const other = await t.otherDevice()
    await using runA = testCreateRun({
      ...t.deps,
      date: { now: () => new Date(1_000) },
    })
    await using runB = testCreateRun({
      ...other,
      date: { now: () => new Date(2_000) },
    })
    await runA.orThrow(trustCashuMint(extra))
    await runB.orThrow(trustCashuMint(extra))
    // Evolu orders writes by a millisecond clock; keep the untrust in a later
    // millisecond than B's trust, as it is in real use.
    await new Promise((resolve) => setTimeout(resolve, 5))
    // Offline: A stops trusting it while B, later, makes it the default.
    await runA.orThrow(untrustCashuMint(extra))
    await runB.orThrow(setDefaultCashuMint(extra))

    syncThrough(relay.url, t.deps.evolu, other.evolu)

    for (const evolu of [t.deps.evolu, other.evolu]) {
      await expect
        .poll(
          async () =>
            orderTrustedCashuMints(
              await evolu.loadQuery(cashuTrustedMintsQuery)
            ),
          { timeout: 15_000, interval: 200 }
        )
        .toEqual([testMintUrl])
      expect(await defaultOf(evolu)).toBe(testMintUrl)
    }
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
    await runB.orThrow(prepareCashuPaymentMethod({ paymentId, accountId }))
    await runB.ok(saveCashuAccount({ enabled: true }))

    syncThrough(relay.url, t.deps.evolu, other.evolu)

    for (const evolu of [t.deps.evolu, other.evolu]) {
      await expect
        .poll(
          async () =>
            orderTrustedCashuMints(
              await evolu.loadQuery(cashuTrustedMintsQuery)
            ),
          { timeout: 15_000, interval: 200 }
        )
        .toEqual([testMintUrl])
      expect(await defaultOf(evolu)).toBe(testMintUrl)
    }
  }, 30_000)
})
