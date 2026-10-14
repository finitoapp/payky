import { kyselySql, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { bookCashuOperations } from "@/core/cashu/cashu-booking.ts"
import { writeCashuDefaultMint } from "@/core/cashu/cashu-mints.ts"
import { claimCashuTopup } from "@/core/cashu/cashu-topup.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createYadioApiDep } from "@/core/integrations/yadio/yadio-client.ts"
import { saveCashuAccount } from "@/core/modules/account/account-actions.ts"
import {
  CashuAmount,
  CashuTokenText,
} from "@/core/modules/cashu/cashu-types.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import { prepareCashuPaymentMethod } from "@/core/modules/payment/payment-preparation-actions.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import {
  createCashuTest,
  testCashuMasterKey,
  testMintUrl,
} from "@/test/cashu.ts"

const setup = async () => {
  const clock: { value: number } = { value: Date.now() }
  const t = await createCashuTest()
  const deps = {
    ...t.deps,
    fetch: async () =>
      new Response(
        JSON.stringify({ BTC: 1_500_000, timestamp: 1_700_000_000_000 })
      ),
    ...createYadioApiDep(),
    masterKey: testCashuMasterKey,
    date: { now: () => new Date(clock.value) },
  }
  await using run = testCreateRun(deps)
  const accountId = await run.ok(saveCashuAccount({ enabled: true }))
  if (accountId === null) throw new Error("no Cashu account")
  await writeCashuDefaultMint(deps.cashuShardStore, testMintUrl)
  return { t, deps, accountId, clock }
}

type Setup = Awaited<ReturnType<typeof setup>>

const newPayment = async ({ deps, accountId }: Setup) => {
  await using run = testCreateRun(deps)
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
  const [operation] = (await deps.cashuShardStore.loadOperations()).filter(
    (op) => op.status === "pending"
  )
  if (operation?.quoteId == null) throw new Error("no topup")
  return { paymentId, operation }
}

const book = async (deps: Setup["deps"]) => {
  await using run = testCreateRun(deps)
  return await run.ok(bookCashuOperations)
}

const transactionsQuery = createQuery((db) =>
  db
    .selectFrom("accountTransaction")
    .innerJoin(
      "accountTransactionCashu",
      "accountTransactionCashu.id",
      "accountTransaction.id"
    )
    .leftJoin(
      "reconciliationClaim",
      "reconciliationClaim.accountTransactionId",
      "accountTransaction.id"
    )
    .select([
      "accountTransaction.id",
      "accountTransaction.kind",
      "accountTransaction.amount",
      "accountTransaction.currency",
      "accountTransactionCashu.cashuOperationId",
      "reconciliationClaim.paymentId",
    ])
)

const accountTransactionMutationsQuery = createQuery((db) =>
  db
    .selectFrom(
      kyselySql<{
        count: number
      }>`(select count(*) as "count" from "evolu_history" where "table" like 'accountTransaction%')`.as(
        "history"
      )
    )
    .select("history.count")
)

describe("bookCashuOperations", () => {
  test("books a settled topup once and claims the payment that holds its quote", async () => {
    const s = await setup()
    await using _ = s.t
    const { paymentId, operation } = await newPayment(s)
    s.t.mint.payMintQuote(operation.quoteId ?? "")
    await using run = testCreateRun(s.deps)
    await run.orThrow(claimCashuTopup(operation.id))

    expect(await book(s.deps)).toEqual({ booked: 1 })

    expect(await s.deps.evolu.loadQuery(transactionsQuery)).toEqual([
      expect.objectContaining({
        kind: "cashu",
        amount: 8_600,
        currency: "BTC",
        cashuOperationId: operation.id,
        paymentId,
      }),
    ])
  })

  test("never rewrites what it booked", async () => {
    const s = await setup()
    await using _ = s.t
    const { operation } = await newPayment(s)
    s.t.mint.payMintQuote(operation.quoteId ?? "")
    await using run = testCreateRun(s.deps)
    await run.orThrow(claimCashuTopup(operation.id))
    await book(s.deps)
    const [before] = await s.deps.evolu.loadQuery(
      accountTransactionMutationsQuery
    )

    await book(s.deps)
    // A change elsewhere in the wallet makes the next run read again.
    await s.deps.cashuShardStore.updateOperation(operation.id, {
      error: "touched",
    })
    await book(s.deps)

    const [after] = await s.deps.evolu.loadQuery(
      accountTransactionMutationsQuery
    )
    expect(after?.count).toBe(before?.count)
  })

  test("books a topup Linky settled, and claims the payment", async () => {
    const s = await setup()
    await using _ = s.t
    const { paymentId, operation } = await newPayment(s)
    // Linky's `done` arriving over sync.
    await s.deps.cashuShardStore.updateOperation(operation.id, {
      status: "done",
    })

    await book(s.deps)

    const [transaction] = await s.deps.evolu.loadQuery(transactionsQuery)
    expect(transaction?.paymentId).toBe(paymentId)
  })

  test("an operation that arrives late with an old time is still booked, and stays unclaimed when no payment holds it", async () => {
    const s = await setup()
    await using _ = s.t
    expect(await book(s.deps)).toEqual({ booked: 0 })

    // A device offline for a week syncs a token Linky received back then.
    const weekAgo = Math.floor(s.clock.value / 1000) - 7 * 24 * 3600
    await s.deps.cashuShardStore.insertOperation({
      kind: "receive",
      status: "done",
      mint: testMintUrl,
      unit: "sat",
      keysetId: null,
      amount: CashuAmount(21),
      feeReserve: null,
      inputsTotal: null,
      quoteId: null,
      invoice: null,
      sourceMint: null,
      counter: null,
      locked: null,
      expiresAtSec: null,
      createdAtSec: weekAgo,
      tokenText: CashuTokenText("cashuBpersonal"),
      error: null,
    })

    expect(await book(s.deps)).toEqual({ booked: 1 })
    const [transaction] = await s.deps.evolu.loadQuery(transactionsQuery)
    expect(transaction).toMatchObject({ amount: 21, paymentId: null })
  })

  test("a new device books only the last month of an existing wallet", async () => {
    const s = await setup()
    await using _ = s.t
    const now = Math.floor(s.clock.value / 1000)
    for (const [text, age] of [
      ["cashuBrecent", 3 * 24 * 3600],
      ["cashuBold", 60 * 24 * 3600],
    ] as const)
      await s.deps.cashuShardStore.insertOperation({
        kind: "receive",
        status: "done",
        mint: testMintUrl,
        unit: "sat",
        keysetId: null,
        amount: CashuAmount(5),
        feeReserve: null,
        inputsTotal: null,
        quoteId: null,
        invoice: null,
        sourceMint: null,
        counter: null,
        locked: null,
        expiresAtSec: null,
        createdAtSec: now - age,
        tokenText: CashuTokenText(text),
        error: null,
      })

    expect(await book(s.deps)).toEqual({ booked: 1 })
  })
})
