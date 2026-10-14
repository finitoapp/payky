import { getEncodedToken } from "@cashu/cashu-ts"
import { testCreateRun } from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"
import { getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import {
  inspectCashuToken,
  receiveCashuToken,
} from "@/core/cashu/cashu-receive.ts"
import { createCashuWalletDep } from "@/core/cashu/cashu-wallet.ts"
import type { DeviceAccountId } from "@/core/evolu/device-client.ts"
import {
  CashuAmount,
  CashuTokenText,
} from "@/core/modules/cashu/cashu-types.ts"
import {
  CashuWalletSeed,
  deriveNostrSecretKey,
} from "@/core/modules/shared/key-derivation.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "@/test/cashu.ts"

type CashuTest = Awaited<ReturnType<typeof createCashuTest>>

const paykyNostrHex = bytesToHex(deriveNostrSecretKey(testCashuMasterKey))

const setup = async (mint: Parameters<typeof createCashuTest>[0] = {}) => {
  const t = await createCashuTest(mint)
  const deps = {
    ...t.deps,
    masterKey: testCashuMasterKey,
    date: { now: () => new Date() },
  }
  // The customer's own wallet: another seed, at the same fake mint.
  const customer = createCashuWalletDep({
    seed: CashuWalletSeed(new Uint8Array(64).fill(9)),
    deviceAccountId: "customer" as DeviceAccountId,
    fetch: t.deps.fetch,
  })
  return { t, deps, customer }
}

const customerToken = async (
  t: CashuTest,
  customer: ReturnType<typeof createCashuWalletDep>,
  amount: number,
  lockTo?: string
) => {
  const wallet = await customer.cashuWallet.load(testMintUrl)
  const quote = await wallet.createMintQuoteBolt11(amount)
  t.mint.payMintQuote(quote.quote)
  const proofs = await wallet.mintProofsBolt11(amount, quote.quote)
  const sendable =
    lockTo === undefined
      ? proofs
      : (
          await wallet.send(amount, proofs, undefined, {
            send: { type: "p2pk", options: { pubkey: lockTo } },
          })
        ).send
  return {
    wallet,
    proofs: sendable,
    text: CashuTokenText(
      getEncodedToken({ mint: testMintUrl, proofs: sendable, unit: "sat" })
    ),
  }
}

const inspect = async (text: CashuTokenText) => {
  const inspected = await inspectCashuToken(text, paykyNostrHex)
  if (!inspected.ok) throw new Error(inspected.error.type)
  return inspected.value
}

const receive = async (
  deps: Awaited<ReturnType<typeof setup>>["deps"],
  text: CashuTokenText
) => {
  await using run = testCreateRun(deps)
  return await run(receiveCashuToken(await inspect(text)))
}

describe("receiveCashuToken", () => {
  test("swaps the token into available proofs under a done receive", async () => {
    const { t, deps, customer } = await setup()
    await using _ = t
    const token = await customerToken(t, customer, 21)

    const result = await receive(deps, token.text)

    expect(result.ok && result.value).toEqual({
      type: "received",
      amount: 21,
      fee: 0,
    })
    const proofs = await deps.cashuShardStore.loadProofs()
    expect(proofs.reduce((sum, proof) => sum + proof.amount, 0)).toBe(21)
    const inspected = await inspect(token.text)
    expect(
      (await deps.cashuShardStore.loadOperation(inspected.receiveOperationId))
        ?.status
    ).toBe("done")
  })

  test("credits what is left after the mint's input fee", async () => {
    const { t, deps, customer } = await setup({ mint: { inputFeePpk: 1000 } })
    await using _ = t
    // 21 sats are three proofs (16, 4, 1): a fee of 3.
    const token = await customerToken(t, customer, 21)

    const result = await receive(deps, token.text)

    expect(result.ok && result.value).toEqual({
      type: "received",
      amount: 18,
      fee: 3,
    })
  })

  test("refuses a token the fee would eat whole, writing nothing", async () => {
    const { t, deps, customer } = await setup({ mint: { inputFeePpk: 1000 } })
    await using _ = t
    const token = await customerToken(t, customer, 1)

    const result = await receive(deps, token.text)

    expect(!result.ok && result.error.type).toBe("AmountConsumedByFee")
    expect(await deps.cashuShardStore.loadOperations()).toEqual([])
  })

  test("a spent token writes nothing", async () => {
    const { t, deps, customer } = await setup()
    await using _ = t
    const token = await customerToken(t, customer, 8)
    await token.wallet.receive(token.text)

    const result = await receive(deps, token.text)

    expect(!result.ok && result.error.type).toBe("ProofsSpent")
    expect(await deps.cashuShardStore.loadOperations()).toEqual([])
  })

  test("an unreachable mint writes nothing", async () => {
    const { t, deps, customer } = await setup()
    await using _ = t
    const token = await customerToken(t, customer, 8)
    t.mint.failNext("info", { type: "unreachable" })

    const result = await receive(deps, token.text)

    expect(!result.ok && result.error.type).toBe("MintUnreachable")
    expect(await deps.cashuShardStore.loadOperations()).toEqual([])
  })

  test("a token locked to another key is refused before any mint is asked", async () => {
    const { t, customer } = await setup()
    await using _ = t
    const someoneElse = `02${getPublicKey(new Uint8Array(32).fill(5))}`
    const token = await customerToken(t, customer, 8, someoneElse)

    const inspected = await inspectCashuToken(token.text, paykyNostrHex)

    expect(!inspected.ok && inspected.error.type).toBe("TokenLocked")
  })

  test("a token locked to the nostr key is signed with it", async () => {
    const { t, deps, customer } = await setup()
    await using _ = t
    const token = await customerToken(
      t,
      customer,
      8,
      `02${getPublicKey(deriveNostrSecretKey(testCashuMasterKey))}`
    )

    const result = await receive(deps, token.text)

    expect(result.ok && result.value).toMatchObject({
      type: "received",
      amount: 8,
    })
  })

  describe("someone else got there first", () => {
    test("Linky received it: done, nothing written", async () => {
      const { t, deps, customer } = await setup()
      await using _ = t
      const token = await customerToken(t, customer, 8)
      await deps.cashuShardStore.insertOperation({
        kind: "receive",
        status: "done",
        mint: testMintUrl,
        unit: "sat",
        keysetId: null,
        amount: CashuAmount(8),
        feeReserve: null,
        inputsTotal: null,
        quoteId: null,
        invoice: null,
        sourceMint: null,
        counter: null,
        locked: null,
        expiresAtSec: null,
        createdAtSec: 1_800_000_000,
        tokenText: token.text,
        error: null,
      })
      const signedBefore = t.mint.signedCount()

      const result = await receive(deps, token.text)

      expect(result.ok && result.value).toEqual({ type: "done" })
      expect(t.mint.signedCount()).toBe(signedBefore)
      expect(await deps.cashuShardStore.loadProofs()).toEqual([])
    })

    test("a receive Linky has pending: nothing is written, never failed", async () => {
      const { t, deps, customer } = await setup()
      await using _ = t
      const token = await customerToken(t, customer, 8)
      const operationId = await deps.cashuShardStore.insertOperation({
        kind: "receive",
        status: "pending",
        mint: testMintUrl,
        unit: "sat",
        keysetId: null,
        amount: CashuAmount(8),
        feeReserve: null,
        inputsTotal: null,
        quoteId: null,
        invoice: null,
        sourceMint: null,
        counter: 7000,
        locked: null,
        expiresAtSec: null,
        createdAtSec: 1_800_000_000,
        tokenText: token.text,
        error: null,
      })

      const result = await receive(deps, token.text)

      expect(result.ok && result.value).toEqual({ type: "claimedElsewhere" })
      expect(
        (await deps.cashuShardStore.loadOperation(operationId))?.status
      ).toBe("pending")
    })
  })
})
