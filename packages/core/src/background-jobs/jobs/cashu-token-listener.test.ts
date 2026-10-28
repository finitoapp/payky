import { testCreateRun } from "@evolu/common"
import { PrivateDirectMessage } from "nostr-tools/kinds"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"
import { createQuery } from "../../evolu/schema.ts"
import { createYadioApiDep } from "../../integrations/yadio/yadio-client.ts"
import { saveCashuAccount } from "../../modules/account/account-actions.ts"
import {
  trustCashuMint,
  untrustCashuMint,
} from "../../modules/cashu/cashu-mint-actions.ts"
import { cashuTokenArrivalQuery } from "../../modules/cashu/cashu-queries.ts"
import { MintUrl } from "../../modules/cashu/cashu-types.ts"
import { createPayment } from "../../modules/payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "../../modules/payment/payment-preparation-actions.ts"
import type { PaymentId } from "../../modules/payment/payment-types.ts"
import { deriveNostrSecretKey } from "../../modules/shared/key-derivation.ts"
import { NonNegativeInteger } from "../../modules/shared/schema.ts"
import {
  createCashuTest,
  createTestCashuCustomer,
  loadTestCashuOperations,
  testCashuBalances,
  testCashuMasterKey,
  testMintUrl,
} from "../../testing/cashu.ts"
import { createFakeNostrDep } from "../../testing/nostr.ts"
import {
  type CashuTokenCandidate,
  createCashuTokenListener,
  matchCashuToken,
} from "./cashu-token-listener.ts"

const candidate = (
  paymentId: string,
  overrides: Partial<CashuTokenCandidate> = {}
): CashuTokenCandidate => ({
  paymentId: paymentId as PaymentId,
  amountSats: 100,
  open: true,
  ...overrides,
})

describe("matchCashuToken", () => {
  test("a payload goes to the open payment its id names, whatever its amount", () => {
    expect(
      matchCashuToken({
        amount: 97,
        requestId: "a",
        candidates: [candidate("a"), candidate("b", { amountSats: 97 })],
      })
    ).toEqual({ type: "payment", paymentId: "a" })
  })

  test("a payload for a payment no longer open is received unassigned", () => {
    expect(
      matchCashuToken({
        amount: 100,
        requestId: "a",
        candidates: [candidate("a", { open: false })],
      })
    ).toEqual({ type: "unassigned" })
  })

  test("a payload naming no known payment is unassigned, not matched by amount", () => {
    expect(
      matchCashuToken({
        amount: 100,
        requestId: "unknown",
        candidates: [candidate("a")],
      })
    ).toEqual({ type: "unassigned" })
  })

  test("a bare token goes to the one open payment of its face amount", () => {
    expect(
      matchCashuToken({
        amount: 100,
        requestId: null,
        candidates: [
          candidate("a"),
          candidate("b", { amountSats: 50 }),
          candidate("d", { open: false }),
        ],
      })
    ).toEqual({ type: "payment", paymentId: "a" })
  })

  test("a bare token two payments fit, or none, is unassigned", () => {
    expect(
      matchCashuToken({
        amount: 100,
        requestId: null,
        candidates: [candidate("a"), candidate("b")],
      })
    ).toEqual({ type: "unassigned" })
    expect(
      matchCashuToken({
        amount: 100,
        requestId: null,
        candidates: [candidate("a", { amountSats: 50 })],
      })
    ).toEqual({ type: "unassigned" })
  })
})

const receiveIdsQuery = createQuery((db) =>
  db.selectFrom("paymentCashu").select(["id", "receiveOperationId"])
)

const claimsQuery = createQuery((db) =>
  db
    .selectFrom("reconciliationClaim")
    .select(["paymentId"])
    .where("isDeleted", "is not", 1)
)

const extraMint = MintUrl("https://extra.mint.test")

/**
 * A Cashu account whose default is the test mint, a second fake mint, one
 * prepared payment, and a fake relay.
 */
const setup = async () => {
  const t = await createCashuTest({ extraMints: [{ url: extraMint }] })
  const fakeNostr = createFakeNostrDep()
  const deps = {
    ...t.deps,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith(testMintUrl) ||
      String(input).startsWith(extraMint)
        ? t.deps.fetch(input, init)
        : new Response(
            JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
          ),
    ...createYadioApiDep(),
    nostr: fakeNostr.nostr,
  }
  await using run = testCreateRun(deps)
  const accountId = await run.ok(saveCashuAccount({ enabled: true }))
  if (accountId === null) throw new Error("no Cashu account")
  const paymentId = await run.orThrow(
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
  await run.orThrow(prepareCashuPaymentMethod({ paymentId, accountId }))
  return { t, deps, fakeNostr, paymentId }
}

type Setup = Awaited<ReturnType<typeof setup>>

/** A customer sends  to Payky's npub over NIP-17. */
const sendToPayky = (s: Setup, content: string) => {
  const payky = getPublicKey(deriveNostrSecretKey(testCashuMasterKey))
  const customer = generateSecretKey()
  s.fakeNostr.deliver(
    createWrap(
      createSeal(
        createRumor(
          {
            kind: PrivateDirectMessage,
            created_at: Math.floor(Date.now() / 1000),
            content,
            tags: [["p", payky]],
          },
          customer
        ),
        customer,
        payky
      ),
      payky
    )
  )
}

const listenOnce = async (s: Setup) => {
  await using run = testCreateRun(s.deps)
  const listener = createCashuTokenListener(run)
  await listener.start(() => undefined)
  await listener.tick()
  listener.stop()
}

const arrivalOf = async (s: Setup, paymentId: PaymentId) =>
  (await s.deps.evolu.loadQuery(cashuTokenArrivalQuery(paymentId)))[0]

describe("the token listener", () => {
  test("a token from a mint not trusted is not received and pays nothing (cashu/0017)", async () => {
    const s = await setup()
    await using _ = s.t
    sendToPayky(
      s,
      JSON.stringify({
        id: s.paymentId,
        mint: "https://rogue.mint",
        unit: "sat",
        proofs: [{ id: "00ad268c4d1f5826", amount: 8, secret: "s", C: "02aa" }],
      })
    )

    await listenOnce(s)

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("untrustedMint")
    expect(
      (await loadTestCashuOperations(s.deps.evolu)).filter(
        (operation) => operation.kind === "receive"
      )
    ).toEqual([])
    expect(
      (await s.deps.evolu.loadQuery(receiveIdsQuery)).find(
        (row) => row.id === s.paymentId
      )?.receiveOperationId
    ).toBeNull()
  })

  test("a token for the payment is received, booked and pays it; the wait screen sees it", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    sendToPayky(s, token.text)

    await listenOnce(s)

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      amount: 8600,
      fee: 0,
    })
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
      { paymentId: s.paymentId },
    ])
  })

  test("a token from a trusted mint that is not the default is received and pays, its money staying there (cashu/0017)", async () => {
    const s = await setup()
    await using _ = s.t
    await using run = testCreateRun(s.deps)
    await run.orThrow(trustCashuMint(extraMint))
    const [extra] = s.t.others
    if (extra === undefined) throw new Error("no extra mint")
    const token = await createTestCashuCustomer({ ...s.t, mint: extra }).token(
      8600
    )
    sendToPayky(s, token.text)

    await listenOnce(s)

    expect(await arrivalOf(s, s.paymentId)).toMatchObject({
      state: "received",
      mintUrl: extraMint,
      amount: 8600,
    })
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([
      { paymentId: s.paymentId },
    ])
    const balances = await testCashuBalances(s.deps.evolu)
    expect(balances.get(extraMint)).toBe(8600)
    expect(balances.get(testMintUrl) ?? 0).toBe(0)
  })

  test("a token from a mint untrusted after the payment was created is refused", async () => {
    const s = await setup()
    await using _ = s.t
    await using run = testCreateRun(s.deps)
    await run.orThrow(trustCashuMint(extraMint))
    const [extra] = s.t.others
    if (extra === undefined) throw new Error("no extra mint")
    const token = await createTestCashuCustomer({ ...s.t, mint: extra }).token(
      8600
    )
    await run.orThrow(untrustCashuMint(extraMint))
    sendToPayky(s, token.text)

    await listenOnce(s)

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("untrustedMint")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
  })

  test("a token Linky on the same npub received first leaves the payment unpaid and says so (cashu/0015)", async () => {
    const s = await setup()
    await using _ = s.t
    const token = await createTestCashuCustomer(s.t).token(8600)
    // Linky, quicker, swaps it into its own wallet.
    await token.wallet.receive(token.text)
    sendToPayky(s, token.text)

    await listenOnce(s)

    expect((await arrivalOf(s, s.paymentId))?.state).toBe("receivedElsewhere")
    expect(await s.deps.evolu.loadQuery(claimsQuery)).toEqual([])
    expect(
      (await loadTestCashuOperations(s.deps.evolu)).filter(
        (operation) => operation.kind === "receive"
      )
    ).toEqual([])
  })
})
