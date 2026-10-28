import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { restoreCashuKeyset } from "../modules/cashu/cashu-counter-actions.ts"
import { toWalletProofs } from "../modules/cashu/cashu-proof-actions.ts"
import { cashuProofsAtMintQuery } from "../modules/cashu/cashu-queries.ts"
import {
  claimCashuTopup,
  createCashuTopupQuote,
} from "../modules/cashu/cashu-topup-actions.ts"
import { CashuAmount, MintUrl } from "../modules/cashu/cashu-types.ts"
import { createCashuTest } from "../testing/cashu.ts"
import { testEnv } from "../testing/test-env.ts"
import { checkProofStates, loadCashuWallet } from "./cashu-wallet.ts"

const testnut = MintUrl("https://testnut.cashu.space")

/**
 * The one run against a real mint: `CASHU_LIVE=true bun run check:tests`.
 * testnut pays its own mint quotes, so nothing is spent.
 */
describe.skipIf(!testEnv.CASHU_LIVE)("live Cashu mint", () => {
  test("quote, claim, state check and restore against testnut", async () => {
    await using t = await createCashuTest({ fetch: globalThis.fetch })
    await using run = testCreateRun(t.deps)
    const quote = await run.orThrow(
      createCashuTopupQuote({
        mint: testnut,
        amount: CashuAmount(16),
        purpose: "move",
      })
    )
    for (let i = 0; i < 30; i += 1) {
      const claim = await run.orThrow(claimCashuTopup(quote.operationId))
      if (claim.type === "claimed") break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    const loaded = await run.orThrow(loadCashuWallet(testnut))
    const proofs = await t.deps.evolu.loadQuery(
      cashuProofsAtMintQuery(testnut, "available")
    )
    expect(proofs.reduce((sum, proof) => sum + proof.amount, 0)).toBe(16)
    const states = await checkProofStates(loaded, toWalletProofs(proofs))
    expect(
      states.ok && states.value.every((state) => state === "unspent")
    ).toBe(true)
    const restored = await run.orThrow(
      restoreCashuKeyset(loaded, loaded.keysetId, 0)
    )
    expect(restored.nextCounter).toBeGreaterThan(0)
  }, 120_000)
})
