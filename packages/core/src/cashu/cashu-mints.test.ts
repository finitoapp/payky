import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { CashuAmount, KeysetId, MintUrl } from "../modules/cashu/cashu-types.ts"
import { createCashuTest } from "../testing/cashu.ts"
import {
  addKnownCashuMint,
  loadCashuDefaultMint,
  loadKnownCashuMints,
  MAIN_MINT_URL,
  parseMintUrlInput,
  removeKnownCashuMint,
  seedCashuDefaultMint,
  writeCashuDefaultMint,
} from "./cashu-mints.ts"

const knownMints = (t: Awaited<ReturnType<typeof createCashuTest>>) =>
  loadKnownCashuMints({
    store: t.deps.cashuShardStore,
    deviceEvolu: t.deps.deviceEvolu,
    deviceAccountId: t.deps.cashuWallet.deviceAccountId,
  })

describe("the default mint", () => {
  test("is Linky's default until a wallet names one", async () => {
    await using t = await createCashuTest()
    expect(await loadCashuDefaultMint(t.deps.cashuShardStore)).toBe(
      MAIN_MINT_URL
    )
  })

  test("is read from Linky's synced setting", async () => {
    await using t = await createCashuTest()
    const store = t.deps.cashuShardStore
    await store.writeSetting("defaultMint", "https://mint.minibits.cash")
    expect(await loadCashuDefaultMint(store)).toBe(
      "https://mint.minibits.cash/Bitcoin"
    )
  })

  test("is seeded once when Cashu is enabled, never over a mint Linky chose", async () => {
    await using t = await createCashuTest()
    const store = t.deps.cashuShardStore
    await seedCashuDefaultMint(store)
    expect(await store.readSetting("defaultMint")).toBe(MAIN_MINT_URL)

    await writeCashuDefaultMint(store, MintUrl("https://kashu.me"))
    await seedCashuDefaultMint(store)
    expect(await store.readSetting("defaultMint")).toBe("https://kashu.me")
  })
})

describe("managing mints", () => {
  test("a typed URL gets https and needs a dot in its host", () => {
    expect(parseMintUrlInput("mint.example.com/")).toBe(
      "https://mint.example.com"
    )
    expect(parseMintUrlInput("http://localhost:3338")).toBeNull()
    expect(parseMintUrlInput("nonsense")).toBeNull()
  })

  test("adds a mint that loads, without making it the default", async () => {
    const extra = MintUrl("https://extra.mint.test")
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)

    expect(await run(addKnownCashuMint("extra.mint.test"))).toEqual({
      ok: true,
      value: extra,
    })
    expect(await knownMints(t)).toContain(extra)
    expect(await t.deps.cashuShardStore.readSetting("defaultMint")).toBeNull()
  })

  test("refuses a mint that does not load", async () => {
    await using t = await createCashuTest()
    await using run = testCreateRun(t.deps)
    const result = await run(addKnownCashuMint("down.mint.test"))
    expect(!result.ok && result.error.type).toBe("MintUnreachable")
    expect(await knownMints(t)).toEqual([])
  })

  test("removes a mint only while nothing in the wallet names it", async () => {
    const extra = MintUrl("https://extra.mint.test")
    await using t = await createCashuTest({ extraMints: [{ url: extra }] })
    await using run = testCreateRun(t.deps)
    await run(addKnownCashuMint("extra.mint.test"))
    await t.deps.cashuShardStore.insertProofs([
      {
        mint: extra,
        unit: "sat",
        keysetId: KeysetId("00aa"),
        amount: CashuAmount(1),
        secret: "s",
        C: "02aa",
        dleq: null,
        state: "available",
        operationId: null,
      },
    ])

    const refused = await run(removeKnownCashuMint(extra))
    expect(!refused.ok && refused.error.type).toBe("CashuMintInUse")

    await t.deps.cashuShardStore.updateProof(
      (await t.deps.cashuShardStore.loadProofs())[0]?.id ?? ("" as never),
      { state: "spent" }
    )
    expect((await run(removeKnownCashuMint(extra))).ok).toBe(true)
  })
})
