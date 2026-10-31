import { ok, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { loadCashuWallet } from "../../cashu/cashu-wallet.ts"
import {
  createCashuTest,
  loadTestCashuProofs,
  storeTestCashuProofs,
  testCashuBalance,
  testMintUrl,
  upsertTestCashuAttemptElsewhere,
} from "../../testing/cashu.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import {
  CASHU_OUTPUT_BLOCK,
  recoverFromCollision,
  withCashuCounter,
} from "./cashu-counter-actions.ts"
import {
  holdCashuProofs,
  releaseCashuProofs,
  spendCashuProofs,
  upsertCashuProofIdentities,
} from "./cashu-proof-actions.ts"
import { CashuAmount, CashuQuoteId, KeysetId } from "./cashu-types.ts"
import {
  cashuMeltOperationIdFor,
  cashuProofIdFor,
  cashuTopupOperationIdFor,
} from "./cashu-utils.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

/** Another device of the account mints `amount` sats at `counter`. */
const anotherDeviceMints = async (
  t: CashuTest,
  amount: number,
  counter: number
) => {
  const other = await t.otherDevice()
  const wallet = await other.cashuWallet.load(testMintUrl)
  const quote = await wallet.createMintQuoteBolt11(amount)
  t.mint.payMintQuote(quote.quote)
  return wallet.mintProofsBolt11(amount, quote.quote, undefined, {
    type: "deterministic",
    counter,
  })
}

const load = async (t: CashuTest) => {
  await using run = testCreateRun(t.deps)
  return await run.orThrow(loadCashuWallet(testMintUrl))
}

describe("cashu counters", () => {
  test("a device's first use of a keyset restores it and starts past the last signed slot", async () => {
    await using t = await createCashuTest()
    const proofs = await anotherDeviceMints(t, 100, 1)
    await anotherDeviceMints(t, 8, 1 + CASHU_OUTPUT_BLOCK)
    const loaded = await load(t)
    await using run = testCreateRun(t.deps)

    const seen = await run(
      withCashuCounter(
        loaded,
        loaded.keysetId,
        (held) => async () => ok(held.current())
      )
    )

    expect(seen.ok && seen.value).toBeGreaterThan(1 + CASHU_OUTPUT_BLOCK)
    const stored = await loadTestCashuProofs(t.deps.evolu)
    expect(stored).toHaveLength(proofs.length + 1)
    expect(stored.every((proof) => proof.state === "available")).toBe(true)
  })

  test("a fresh wallet starts at slot 1, never 0", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    await using run = testCreateRun(t.deps)
    const seen = await run(
      withCashuCounter(
        loaded,
        loaded.keysetId,
        (held) => async () => ok(held.current())
      )
    )
    expect(seen.ok && seen.value).toBe(1)
  })

  test("the counter never moves back", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    await using run = testCreateRun(t.deps)
    await run(
      withCashuCounter(
        loaded,
        loaded.keysetId,
        (held) => async () => ok(await held.advanceTo(200))
      )
    )
    const after = await run(
      withCashuCounter(
        loaded,
        loaded.keysetId,
        (held) => async () => ok(await held.advanceTo(10))
      )
    )
    expect(after.ok && after.value).toBe(200)
  })

  test("concurrent reservations get distinct blocks", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    await using run = testCreateRun(t.deps)
    const reserve = () =>
      run(
        withCashuCounter(loaded, loaded.keysetId, (held) => async () => {
          const counter = held.current()
          await new Promise((resolve) => setTimeout(resolve, 5))
          await held.advanceTo(counter + CASHU_OUTPUT_BLOCK)
          return ok(counter)
        })
      )
    const results = await Promise.all([reserve(), reserve(), reserve()])
    const counters = results.map((result) => (result.ok ? result.value : -1))
    expect(counters.toSorted((a, b) => a - b)).toEqual([
      1,
      1 + CASHU_OUTPUT_BLOCK,
      1 + 2 * CASHU_OUTPUT_BLOCK,
    ])
  })

  test("a collision with slots another device used jumps past the last signed one", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    await using run = testCreateRun(t.deps)
    // This device's counter exists already, so no restore runs.
    await run(
      withCashuCounter(loaded, loaded.keysetId, () => async () => ok(undefined))
    )
    await anotherDeviceMints(t, 100, 1)

    const quote = await loaded.wallet.createMintQuoteBolt11(100)
    t.mint.payMintQuote(quote.quote)
    const recovered = await run(
      withCashuCounter(loaded, loaded.keysetId, (held) => async () => {
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
          await recoverFromCollision(
            loaded,
            loaded.keysetId,
            held,
            counter,
            error
          )
        )
      })
    )
    // 100 sats are 3 outputs (64, 32, 4): slots 1, 2, 3.
    expect(recovered.ok && recovered.value).toBe(4)
  })

  test("the counter starts past every block on record, whichever device reserved it (cashu/0031)", async () => {
    await using t = await createCashuTest()
    const loaded = await load(t)
    await using run = testCreateRun(t.deps)
    // This device's counter stands at slot 1.
    await run(
      withCashuCounter(loaded, loaded.keysetId, () => async () => ok(undefined))
    )
    // Another device's blocks sync in, a melt's two among them.
    const operationId = cashuTopupOperationIdFor(
      testMintUrl,
      CashuQuoteId("elsewhere")
    )
    await runMutationWithCompletion((options) => {
      upsertTestCashuAttemptElsewhere(
        t.deps.evolu,
        { operationId, keysetId: loaded.keysetId, counter: 1, role: "mint" },
        options
      )
      upsertTestCashuAttemptElsewhere(
        t.deps.evolu,
        {
          operationId,
          keysetId: loaded.keysetId,
          counter: 1 + CASHU_OUTPUT_BLOCK,
          role: "meltSwap",
          slots: 2 * CASHU_OUTPUT_BLOCK,
        },
        options
      )
    })

    const seen = await run(
      withCashuCounter(
        loaded,
        loaded.keysetId,
        (held) => async () => ok(held.current())
      )
    )

    expect(seen.ok && seen.value).toBe(1 + 3 * CASHU_OUTPUT_BLOCK)
  })
})

describe("a proof's state only moves forward (cashu/0024)", () => {
  const proof = {
    mintUrl: testMintUrl,
    keysetId: "00aabbccddeeff00",
    amount: 8,
    secret: "a proof's secret",
  }
  const identity = {
    id: cashuProofIdFor(proof.secret),
    mintUrl: proof.mintUrl,
    keysetId: KeysetId(proof.keysetId),
    amount: CashuAmount(proof.amount),
    secret: proof.secret,
    c: "02aa",
    dleq: null,
  }
  const meltId = cashuMeltOperationIdFor(testMintUrl, CashuQuoteId("a-melt"))

  test("a restore written after another device's hold leaves the proof held", async () => {
    await using t = await createCashuTest()
    await storeTestCashuProofs(t.deps.evolu, [proof])
    await runMutationWithCompletion((options) =>
      holdCashuProofs(t.deps.evolu, [identity.id], meltId, options)
    )

    // Another device restored the proof without seeing the hold; its write
    // is the later one.
    await runMutationWithCompletion((options) =>
      upsertCashuProofIdentities(t.deps.evolu, [identity], options)
    )

    const [stored] = await loadTestCashuProofs(t.deps.evolu)
    expect(stored).toMatchObject({ state: "held", operationId: meltId })
    expect(await testCashuBalance(t.deps.evolu)).toBe(0)
  })

  test("a spent proof stays spent whatever is written after it", async () => {
    await using t = await createCashuTest()
    await storeTestCashuProofs(t.deps.evolu, [proof])
    await runMutationWithCompletion((options) =>
      spendCashuProofs(t.deps.evolu, [identity.id], options)
    )

    await runMutationWithCompletion((options) => {
      upsertCashuProofIdentities(t.deps.evolu, [identity], options)
      releaseCashuProofs(t.deps.evolu, [identity.id], options)
    })

    const [stored] = await loadTestCashuProofs(t.deps.evolu)
    expect(stored?.state).toBe("spent")
    expect(await testCashuBalance(t.deps.evolu)).toBe(0)
  })
})
