import { testCreateConsole, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { FakeCashuWallet } from "@/core/cashu/cashu-wallet-test-fixtures.ts"
import { createInProcessLockManager } from "@/core/cli/in-process-lock-manager.ts"
import type { FetchDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  CashuMintUrl,
  NonEmptyString255,
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveNumberSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { createTestDateDep } from "@/test/date-dep.ts"
import { createCashuAccountTransactionSyncJob } from "./cashu-account-transaction-sync-job.ts"

const unimplementedFetch: FetchDep["fetch"] = (() => {
  throw new Error("fetch is not implemented in this test.")
}) as unknown as FetchDep["fetch"]

const cashuTransactionsByAccountIdQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .innerJoin(
        "accountTransactionCashu",
        "accountTransactionCashu.id",
        "accountTransaction.id"
      )
      .select([
        "accountTransaction.accountId",
        "accountTransaction.kind",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransactionCashu.mintUrl",
        "accountTransactionCashu.quoteId",
        "accountTransactionCashu.lnInvoice",
      ])
      .where("accountTransaction.accountId", "=", accountId)
      .where("accountTransaction.isDeleted", "is not", 1)
  )

const claimsByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .select(["paymentId", "source"])
      .where("paymentId", "=", paymentId)
      .where("isDeleted", "is not", 1)
  )

const mintUrl = CashuMintUrl("https://mint.example")

describe("cashu account transaction sync job", () => {
  test("records a minted topup once and claims the payment quoted for it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    })
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Cashu wallet"),
        cashu: { mintUrl },
      })
    )
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
        cashu: {
          accountId,
          amountSats: NonNegativeInteger(860),
          exchangeRate: PositiveNumberSchema.decode(1_500_000),
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: TimestampMsSchema.decode(1_700_000_000_000),
          mintUrl,
          quoteId: NonEmptyStringSchema.decode("quote-1"),
          lnInvoice: NonEmptyStringSchema.decode("lnbc8600n1cashu"),
        },
      })
    )

    const wallet = new FakeCashuWallet()
    const errors: unknown[] = []
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
      fetch: unimplementedFetch,
      lockManager: createInProcessLockManager(),
      cashuWallet: wallet,
      nostrInbox: null,
      onError: (error: unknown) => {
        errors.push(error)
      },
    })
    await using _job = await jobRun.ok(
      createCashuAccountTransactionSyncJob({ recheckIntervalMs: 10 })
    )

    // The job keeps the wallet's watchers alive while the account is active.
    await expect.poll(() => wallet.watchCalls.length).toBeGreaterThan(0)

    const receipt = {
      quoteId: "quote-1",
      mintUrl,
      amountSats: 860,
      invoice: "lnbc8600n1cashu",
    }
    wallet.emitTopupSettled(receipt)
    wallet.emitTopupSettled(receipt)

    await expect
      .poll(() => evolu.loadQuery(cashuTransactionsByAccountIdQuery(accountId)))
      .toEqual([
        {
          accountId,
          kind: "cashu",
          amount: 860,
          currency: "BTC",
          mintUrl,
          quoteId: "quote-1",
          lnInvoice: "lnbc8600n1cashu",
        },
      ])
    await expect
      .poll(() => evolu.loadQuery(claimsByPaymentIdQuery(paymentId)))
      .toEqual([{ paymentId, source: "auto" }])
    expect(errors).toEqual([])
  })

  test("does nothing when the runtime has no wallet", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
      fetch: unimplementedFetch,
      lockManager: createInProcessLockManager(),
      cashuWallet: null,
      nostrInbox: null,
      onError: () => undefined,
    })

    await using job = await jobRun.ok(
      createCashuAccountTransactionSyncJob({ recheckIntervalMs: 10 })
    )

    await expect(job[Symbol.asyncDispose]()).resolves.toBeUndefined()
  })

  test("stops listening to the wallet once disposed", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const wallet = new FakeCashuWallet()
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
      fetch: unimplementedFetch,
      lockManager: createInProcessLockManager(),
      cashuWallet: wallet,
      nostrInbox: null,
      onError: () => undefined,
    })
    const job = await jobRun.ok(
      createCashuAccountTransactionSyncJob({ recheckIntervalMs: 10 })
    )

    expect(wallet.listenerCount()).toBe(1)
    await job[Symbol.asyncDispose]()
    expect(wallet.listenerCount()).toBe(0)
  })
})
