import { ok, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import {
  CASHU_OUTPUT_BLOCK,
  counterScopeOf,
  recoverFromCollision,
  withCashuCounter,
} from "@/core/cashu/cashu-counters.ts"
import { loadCashuWallet } from "@/core/cashu/cashu-wallet.ts"
import { createCashuTest, testMintUrl } from "@/test/cashu.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

/** Linky, elsewhere, mints `amount` sats at `counter` with the same seed. */
const linkyMints = async (t: CashuTest, amount: number, counter: number) => {
  const wallet = await t.linkyWallet.cashuWallet.load(testMintUrl)
  const quote = await wallet.createMintQuoteBolt11(amount)
  t.mint.payMintQuote(quote.quote)
  return wallet.mintProofsBolt11(amount, quote.quote, undefined, {
    type: "deterministic",
    counter,
  })
}

const load = async (t: CashuTest) => {
  await using run = testCreateRun(t.deps)
  const loaded = await run(loadCashuWallet(testMintUrl))
  if (!loaded.ok) throw new Error(loaded.error.type)
  return loaded.value
}

describe("cashu counters", () => {
  test("a device's first use of a keyset restores it and starts past the last signed slot", async () => {
    await using t = await createCashuTest()
    const proofs = await linkyMints(t, 100, 1)
    await linkyMints(t, 8, 1 + CASHU_OUTPUT_BLOCK)
    const loaded = await load(t)

    const seen = await withCashuCounter(
      t.deps,
      loaded,
      counterScopeOf(loaded, loaded.keysetId),
      async (held) => ok(held.current())
    )

    expect(seen.ok && seen.value).toBeGreaterThan(1 + CASHU_OUTPUT_BLOCK)
    const stored = await t.deps.cashuShardStore.loadProofs()
    expect(stored.map((proof) => proof.secret)).toEqual(
      expect.arrayContaining(proofs.map((proof) => proof.secret))
    )
    expect(stored.every((proof) => proof.state === "available")).toBe(true)
  })

  test("a fresh wallet starts at slot 1, never 0", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    const seen = await withCashuCounter(
      t.deps,
      loaded,
      counterScopeOf(loaded, loaded.keysetId),
      async (held) => ok(held.current())
    )
    expect(seen.ok && seen.value).toBe(1)
  })

  test("the counter never moves back", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    const scope = counterScopeOf(loaded, loaded.keysetId)
    await withCashuCounter(t.deps, loaded, scope, async (held) =>
      ok(await held.advanceTo(200))
    )
    const after = await withCashuCounter(t.deps, loaded, scope, async (held) =>
      ok(await held.advanceTo(10))
    )
    expect(after.ok && after.value).toBe(200)
  })

  test("concurrent reservations get distinct blocks", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    const scope = counterScopeOf(loaded, loaded.keysetId)
    const reserve = () =>
      withCashuCounter(t.deps, loaded, scope, async (held) => {
        const counter = held.current()
        await new Promise((resolve) => setTimeout(resolve, 5))
        await held.advanceTo(counter + CASHU_OUTPUT_BLOCK)
        return ok(counter)
      })
    const results = await Promise.all([reserve(), reserve(), reserve()])
    const counters = results.map((result) => (result.ok ? result.value : -1))
    expect(new Set(counters).size).toBe(3)
    expect(counters.toSorted((a, b) => a - b)).toEqual([
      1,
      1 + CASHU_OUTPUT_BLOCK,
      1 + 2 * CASHU_OUTPUT_BLOCK,
    ])
  })

  test("a collision with slots Linky used jumps past the last signed one", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    const scope = counterScopeOf(loaded, loaded.keysetId)
    // This device's counter exists already, so no restore runs.
    await withCashuCounter(t.deps, loaded, scope, async () => ok(undefined))
    await linkyMints(t, 100, 1)

    const quote = await loaded.wallet.createMintQuoteBolt11(100)
    t.mint.payMintQuote(quote.quote)
    const recovered = await withCashuCounter(
      t.deps,
      loaded,
      scope,
      async (held) => {
        const counter = held.current()
        const error = await loaded.wallet
          .mintProofsBolt11(100, quote.quote, undefined, {
            type: "deterministic",
            counter,
          })
          .then(
            () => null,
            (failure: unknown) => failure
          )
        return ok(
          await recoverFromCollision(loaded, scope, held, counter, error)
        )
      }
    )
    // 100 sats are 3 outputs (64, 32, 4): slots 1, 2, 3.
    expect(recovered.ok && recovered.value).toBe(4)
  })
})
