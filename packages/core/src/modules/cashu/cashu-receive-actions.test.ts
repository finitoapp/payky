import { testCreateRun } from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"
import { getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"
import {
  createCashuTest,
  createTestCashuCustomer,
  loadTestCashuProofs,
  testCashuBalance,
  testCashuMasterKey,
  testMintUrl,
} from "../../testing/cashu.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "../shared/key-derivation.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import { loadCashuReceive } from "./cashu-guards.ts"
import {
  updateCashuOperation,
  upsertCashuOperationRow,
} from "./cashu-proof-actions.ts"
import { cashuOperationCountQuery } from "./cashu-queries.ts"
import {
  inspectCashuToken,
  receiveCashuToken,
} from "./cashu-receive-actions.ts"
import { CashuAmount, type CashuTokenText } from "./cashu-types.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

const paykyNostrHex = bytesToHex(deriveNostrSecretKey(testCashuMasterKey))

const inspect = async (text: CashuTokenText) => {
  const inspected = await inspectCashuToken(text, paykyNostrHex)
  if (!inspected.ok) throw new Error(inspected.error.type)
  return inspected.value
}

const receive = async (t: CashuTest, text: CashuTokenText) => {
  await using run = testCreateRun(t.deps)
  return await run(receiveCashuToken(await inspect(text)))
}

const operationCount = async (t: CashuTest) =>
  (await t.deps.evolu.loadQuery(cashuOperationCountQuery))[0]?.count

/** Another device's receive of the same token, as it syncs in. */
const writeReceiveElsewhere = async (
  t: CashuTest,
  text: CashuTokenText,
  status: "pending" | "done"
) => {
  const { receiveOperationId } = await inspect(text)
  await runMutationWithCompletion((options) => {
    upsertCashuOperationRow(
      t.deps.evolu,
      {
        id: receiveOperationId,
        kind: "receive",
        status,
        mintUrl: testMintUrl,
        amount: CashuAmount(8),
        keysetId: null,
      },
      options
    )
    updateCashuOperation(
      t.deps.evolu,
      receiveOperationId,
      { counter: NonNegativeInteger(7000) },
      options
    )
    t.deps.evolu.upsert(
      "cashuReceive",
      { id: receiveOperationId, tokenText: text, fee: NonNegativeInteger(0) },
      options
    )
  })
  return receiveOperationId
}

describe("receiveCashuToken", () => {
  test("swaps the token into available proofs under a done receive", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(21)

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toEqual({
      type: "received",
      amount: 21,
      fee: 0,
    })
    expect(await testCashuBalance(t.deps.evolu)).toBe(21)
    await using run = testCreateRun(t.deps)
    const receiveRow = await run.ok(
      loadCashuReceive((await inspect(token.text)).receiveOperationId)
    )
    expect(receiveRow).toMatchObject({
      status: "done",
      tokenText: token.text,
      fee: 0,
    })
  })

  test("credits what is left after the mint's input fee", async () => {
    await using t = await createCashuTest({ mint: { inputFeePpk: 1000 } })
    // 21 sats are three proofs (16, 4, 1): a fee of 3.
    const token = await createTestCashuCustomer(t).token(21)

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toEqual({
      type: "received",
      amount: 18,
      fee: 3,
    })
  })

  test("refuses a token the fee would eat whole, writing nothing", async () => {
    await using t = await createCashuTest({ mint: { inputFeePpk: 1000 } })
    const token = await createTestCashuCustomer(t).token(1)

    const result = await receive(t, token.text)

    expect(!result.ok && result.error.type).toBe("AmountConsumedByFee")
    expect(await operationCount(t)).toBe(0)
  })

  test("a token another wallet already spent is received elsewhere, writing nothing", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(8)
    // Linky on the same npub swapped it first (cashu/0015).
    await token.wallet.receive(token.text)

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toEqual({ type: "receivedElsewhere" })
    expect(await operationCount(t)).toBe(0)
  })

  test("an unreachable mint writes nothing", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(8)
    t.mint.failNext("info", { type: "unreachable" })

    const result = await receive(t, token.text)

    expect(!result.ok && result.error.type).toBe("MintUnreachable")
    expect(await operationCount(t)).toBe(0)
  })

  test("a token locked to another key is refused before any mint is asked", async () => {
    await using t = await createCashuTest()
    const someoneElse = `02${getPublicKey(new Uint8Array(32).fill(5))}`
    const token = await createTestCashuCustomer(t).token(8, someoneElse)

    const inspected = await inspectCashuToken(token.text, paykyNostrHex)

    expect(!inspected.ok && inspected.error.type).toBe("TokenLocked")
  })

  test("a token locked to the nostr key is signed with it", async () => {
    await using t = await createCashuTest()
    const token = await createTestCashuCustomer(t).token(
      8,
      `02${getPublicKey(deriveNostrSecretKey(testCashuMasterKey))}`
    )

    const result = await receive(t, token.text)

    expect(result.ok && result.value).toMatchObject({
      type: "received",
      amount: 8,
    })
  })

  describe("another device got there first", () => {
    test("another device received it: done, nothing written", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      await writeReceiveElsewhere(t, token.text, "done")
      const signedBefore = t.mint.signedCount()

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({ type: "done" })
      expect(t.mint.signedCount()).toBe(signedBefore)
      expect(await loadTestCashuProofs(t.deps.evolu)).toEqual([])
    })

    test("a receive another device has pending: nothing is written, never failed", async () => {
      await using t = await createCashuTest()
      const token = await createTestCashuCustomer(t).token(8)
      const operationId = await writeReceiveElsewhere(t, token.text, "pending")

      const result = await receive(t, token.text)

      expect(result.ok && result.value).toEqual({ type: "receivedElsewhere" })
      await using run = testCreateRun(t.deps)
      expect((await run.ok(loadCashuReceive(operationId)))?.status).toBe(
        "pending"
      )
    })
  })
})
