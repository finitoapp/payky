import { getEncodedToken } from "@cashu/cashu-ts"
import { ok, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { MintUrl } from "../modules/cashu/cashu-types.ts"
import { createCashuTest } from "../testing/cashu.ts"
import { testEnv } from "../testing/test-env.ts"
import {
  CASHU_OUTPUT_BLOCK,
  counterScopeOf,
  withCashuCounter,
} from "./cashu-counters.ts"
import { restoreKeyset } from "./cashu-restore.ts"
import { checkProofStates, loadCashuWallet } from "./cashu-wallet.ts"

const testnut = MintUrl("https://testnut.cashu.space")

/**
 * The one run against a real mint (cashu.md, phase 2): `CASHU_LIVE=true bun
 * run check:tests`. testnut pays its own mint quotes, so nothing is spent.
 */
describe.skipIf(!testEnv.CASHU_LIVE)("live Cashu mint", () => {
  test("quote, mint, swap, state check and restore against testnut", async () => {
    await using t = await createCashuTest({ fetch: globalThis.fetch })
    await using run = testCreateRun(t.deps)
    const loaded = await run.orThrow(loadCashuWallet(testnut))
    const quote = await loaded.wallet.createMintQuoteBolt11(16)
    for (let i = 0; i < 30; i += 1) {
      const state = await loaded.wallet.checkMintQuoteBolt11(quote.quote)
      if (state.state === "PAID") break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    const scope = counterScopeOf(loaded, loaded.keysetId)

    const minted = await withCashuCounter(
      t.deps,
      loaded,
      scope,
      async (held) => {
        const counter = held.current()
        await held.advanceTo(counter + CASHU_OUTPUT_BLOCK)
        return ok({
          counter,
          proofs: await loaded.wallet.mintProofsBolt11(
            16,
            quote.quote,
            undefined,
            {
              type: "deterministic",
              counter,
            }
          ),
        })
      }
    )
    if (!minted.ok) throw new Error(minted.error.type)

    const swapped = await withCashuCounter(
      t.deps,
      loaded,
      scope,
      async (held) => {
        const counter = held.current()
        await held.advanceTo(counter + CASHU_OUTPUT_BLOCK)
        return ok(
          await loaded.wallet.receive(
            getEncodedToken({
              mint: testnut,
              proofs: minted.value.proofs,
              unit: "sat",
            }),
            undefined,
            { type: "deterministic", counter }
          )
        )
      }
    )
    if (!swapped.ok) throw new Error(swapped.error.type)

    const states = await checkProofStates(loaded, swapped.value)
    expect(
      states.ok && states.value.every((state) => state === "unspent")
    ).toBe(true)
    const restored = await restoreKeyset(
      loaded,
      t.deps.cashuShardStore,
      loaded.keysetId,
      minted.value.counter
    )
    expect(restored.ok && restored.value.nextCounter).toBeGreaterThan(
      minted.value.counter
    )
  }, 120_000)
})
