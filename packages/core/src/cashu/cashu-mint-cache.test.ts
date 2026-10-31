import { describe, expect, test } from "vitest"
import { deriveCashuWalletSeed } from "../modules/shared/key-derivation.ts"
import { testCashuMasterKey, testMintUrl } from "../testing/cashu.ts"
import { createEvoluTest } from "../testing/evolu.ts"
import { createCashuMintCache } from "./cashu-mint-cache.ts"
import { createCashuWalletDep } from "./cashu-wallet.ts"
import { createFakeCashuMint } from "./fake-cashu-mint.ts"

const setup = async () => {
  const node = await createEvoluTest()
  const mint = createFakeCashuMint({ url: testMintUrl })
  const mintCache = createCashuMintCache(node.evolu)
  /** A session's wallets: a new dep is a new start of the app. */
  const session = () =>
    createCashuWalletDep({
      seed: deriveCashuWalletSeed(testCashuMasterKey),
      fetch: mint.fetch,
      mintCache,
    }).cashuWallet
  const cached = async () => (await mintCache.read(testMintUrl)) !== null
  return { node, mint, mintCache, session, cached }
}

describe("createCashuMintCache", () => {
  test("a wallet loads from the mint once, and from the cache in a later session", async () => {
    const { node, mint, session, cached } = await setup()
    await using _ = node

    const first = await session().load(testMintUrl)
    expect(first.keysetId).toBe(mint.keysetId)
    await expect.poll(cached).toBe(true)

    // The mint answers nothing now; the next session loads all the same.
    for (const endpoint of ["info", "keysets", "keys"] as const)
      for (let i = 0; i < 5; i++)
        mint.failNext(endpoint, { type: "unreachable" })
    const later = await session().load(testMintUrl)
    expect(later.keysetId).toBe(mint.keysetId)
    expect(later.getMintInfo().name).toBe("Fake mint")
  })

  test("a wallet loaded from the cache refreshes it from the mint behind, a rotated keyset included", async () => {
    const { node, mint, mintCache, session, cached } = await setup()
    await using _ = node
    await session().load(testMintUrl)
    await expect.poll(cached).toBe(true)

    mint.rotateKeyset()
    await session().load(testMintUrl)

    await expect
      .poll(async () =>
        (await mintCache.read(testMintUrl))?.keychain.keysets.map(
          (keyset) => keyset.id
        )
      )
      .toContain(mint.keysetId)
  })

  test("a wallet that must be current waits for the refresh behind the cache, asking again after one failed", async () => {
    const { node, mint, session, cached } = await setup()
    await using _ = node
    await session().load(testMintUrl)
    await expect.poll(cached).toBe(true)
    const retired = mint.keysetId

    mint.rotateKeyset()
    mint.failNext("info", { type: "unreachable" })
    mint.failNext("keysets", { type: "unreachable" })
    const later = session()
    expect((await later.load(testMintUrl)).keysetId).toBe(retired)

    expect((await later.loadCurrent(testMintUrl)).keysetId).toBe(mint.keysetId)
  })

  test("a refresh asked for keeps the mint's new keysets for a later session", async () => {
    const { node, mint, mintCache, session } = await setup()
    await using _ = node
    const wallets = session()
    await wallets.load(testMintUrl)

    mint.rotateKeyset()
    await wallets.refresh(testMintUrl)

    await expect
      .poll(async () =>
        (await mintCache.read(testMintUrl))?.keychain.keysets.map(
          (keyset) => keyset.id
        )
      )
      .toContain(mint.keysetId)
  })

  test("a cache that cannot be written, its database closed, fails no load nor refresh", async () => {
    const { node, mint, mintCache, session, cached } = await setup()
    await using _ = node
    await session().load(testMintUrl)
    await expect.poll(cached).toBe(true)
    const broken = createCashuWalletDep({
      seed: deriveCashuWalletSeed(testCashuMasterKey),
      fetch: mint.fetch,
      mintCache: {
        read: mintCache.read,
        write: () => {
          throw new Error("the database is closed")
        },
      },
    }).cashuWallet

    mint.rotateKeyset()

    expect((await broken.loadCurrent(testMintUrl)).keysetId).toBe(mint.keysetId)
    await expect(broken.refresh(testMintUrl)).resolves.toBeDefined()
  })

  test("a fresh load for showing a mint's info never reads the cache", async () => {
    const { node, mint, session, cached } = await setup()
    await using _ = node
    await session().load(testMintUrl)
    await expect.poll(cached).toBe(true)

    mint.failNext("info", { type: "unreachable" })
    await expect(session().loadFresh(testMintUrl)).rejects.toThrow()
  })

  test("a write that throws is tried again by the next one with the same keysets", async () => {
    const { node, mint } = await setup()
    await using _ = node
    const failing = { next: true }
    const evolu = new Proxy(node.evolu, {
      get: (target, key, receiver) =>
        key === "upsert" && failing.next
          ? () => {
              failing.next = false
              throw new Error("database closed")
            }
          : Reflect.get(target, key, receiver),
    })
    const mintCache = createCashuMintCache(evolu)
    const wallet = await createCashuWalletDep({
      seed: deriveCashuWalletSeed(testCashuMasterKey),
      fetch: mint.fetch,
    }).cashuWallet.load(testMintUrl)
    const snapshot = {
      info: wallet.getMintInfo().cache,
      keychain: wallet.keyChain.cache,
    }

    expect(() => mintCache.write(testMintUrl, snapshot)).toThrow()
    mintCache.write(testMintUrl, snapshot)

    await expect
      .poll(async () => (await mintCache.read(testMintUrl)) !== null)
      .toBe(true)
  })
})
