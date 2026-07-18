import { createIdFromString, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import type {
  SparkExitSpeed,
  SparkWalletDep,
  SparkWithdrawalFeeQuote,
} from "@/core/spark/spark-wallet.ts"
import { executeWithdrawal, quoteWithdrawal } from "./withdrawal-actions.ts"

const fixedDate = new Date("2026-06-05T12:00:00.000Z")
const validAddress = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"

const createDateDeps = (): DateDep => ({
  date: {
    now: () => fixedDate,
  },
})

const feeQuote: SparkWithdrawalFeeQuote = {
  id: "fee-quote-1",
  expiresAt: "2026-06-05T12:05:00.000Z",
  fast: { userFeeSats: 300, l1BroadcastFeeSats: 500, totalFeeSats: 800 },
  medium: { userFeeSats: 200, l1BroadcastFeeSats: 300, totalFeeSats: 500 },
  slow: { userFeeSats: 100, l1BroadcastFeeSats: 150, totalFeeSats: 250 },
}

const createSparkAccount = async (deps: EvoluDep): Promise<AccountId> => {
  await using run = testCreateRun(deps)
  const accountId = await run.orThrow(
    createAccount({
      deviceId: null,
      name: "Spark wallet",
      spark: {
        secret: "42373a7543db65ae0228ead6c9cbffcc",
      },
    })
  )

  return accountId
}

const accountTransactionsWithOnchainQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .innerJoin(
        "accountTransactionOnchain",
        "accountTransactionOnchain.id",
        "accountTransaction.id"
      )
      .innerJoin(
        "accountTransactionSource",
        "accountTransactionSource.accountTransactionId",
        "accountTransaction.id"
      )
      .select([
        "accountTransaction.id",
        "accountTransaction.accountId",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransaction.kind",
        "accountTransactionOnchain.onchainAddress",
        "accountTransactionOnchain.coopExitRequestId",
        "accountTransactionOnchain.exitSpeed",
        "accountTransactionOnchain.feeSats",
        "accountTransactionOnchain.txid",
        "accountTransactionSource.deviceId",
        "accountTransactionSource.source",
      ])
      .where("accountTransaction.accountId", "=", accountId)
  )

describe("quoteWithdrawal", () => {
  test("returns a fee quote for a specific amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const accountId = await createSparkAccount({ evolu })
    const deps = {
      evolu,
      sparkWallet: {
        create: async () => ({
          getBalance: async () => ({ availableSats: 100_000 }),
          getWithdrawalFeeQuote: async () => feeQuote,
        }),
      },
    } satisfies EvoluDep & SparkWalletDep
    await using run = testCreateRun(deps)

    const result = await run(
      quoteWithdrawal({
        accountId,
        onchainAddress: validAddress,
        amountSats: 10_000,
      })
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        availableSats: 100_000,
        amountSats: 10_000,
        withdrawAll: false,
        feeQuote,
      },
    })
  })

  test("quotes against the full balance when withdrawing all", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const accountId = await createSparkAccount({ evolu })
    const deps = {
      evolu,
      sparkWallet: {
        create: async () => ({
          getBalance: async () => ({ availableSats: 50_000 }),
          getWithdrawalFeeQuote: async () => feeQuote,
        }),
      },
    } satisfies EvoluDep & SparkWalletDep
    await using run = testCreateRun(deps)

    const result = await run(
      quoteWithdrawal({
        accountId,
        onchainAddress: validAddress,
      })
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        availableSats: 50_000,
        amountSats: 50_000,
        withdrawAll: true,
      },
    })
  })

  test("rejects an invalid Bitcoin address", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const accountId = await createSparkAccount({ evolu })
    const deps = {
      evolu,
      sparkWallet: {
        create: async () => ({
          getBalance: async () => ({ availableSats: 100_000 }),
          getWithdrawalFeeQuote: async () => feeQuote,
        }),
      },
    } satisfies EvoluDep & SparkWalletDep
    await using run = testCreateRun(deps)

    const result = await run(
      quoteWithdrawal({
        accountId,
        onchainAddress: "not-a-bitcoin-address",
        amountSats: 10_000,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "InvalidBitcoinAddress" },
    })
  })

  test("rejects a request for more than the available balance", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const accountId = await createSparkAccount({ evolu })
    const deps = {
      evolu,
      sparkWallet: {
        create: async () => ({
          getBalance: async () => ({ availableSats: 1_000 }),
          getWithdrawalFeeQuote: async () => feeQuote,
        }),
      },
    } satisfies EvoluDep & SparkWalletDep
    await using run = testCreateRun(deps)

    const result = await run(
      quoteWithdrawal({
        accountId,
        onchainAddress: validAddress,
        amountSats: 10_000,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "InsufficientWithdrawalBalance" },
    })
  })

  test("fails for an unknown account", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      sparkWallet: {
        create: async () => ({
          getBalance: async () => ({ availableSats: 100_000 }),
          getWithdrawalFeeQuote: async () => feeQuote,
        }),
      },
    } satisfies EvoluDep & SparkWalletDep
    await using run = testCreateRun(deps)

    const result = await run(
      quoteWithdrawal({
        accountId: "unknown" as AccountId,
        onchainAddress: validAddress,
        amountSats: 10_000,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "WithdrawalAccountNotFound" },
    })
  })
})

describe("executeWithdrawal", () => {
  test("withdraws a specific amount and records the ledger entry", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const accountId = await createSparkAccount({ evolu })
    const deps = {
      evolu,
      ...createDateDeps(),
      sparkWallet: {
        create: async () => ({
          withdraw: async () => ({
            id: "coop-exit-1",
            status: "INITIATED",
            txid: "txid-1",
          }),
        }),
      },
    } satisfies EvoluDep & DateDep & SparkWalletDep
    await using run = testCreateRun(deps)
    const exitSpeed: SparkExitSpeed = "medium"
    const deviceId = createIdFromString<"Device">("withdrawal-test-device")

    const result = await run(
      executeWithdrawal({
        accountId,
        onchainAddress: validAddress,
        amountSats: 10_000,
        withdrawAll: false,
        availableSats: 100_000,
        exitSpeed,
        feeQuote,
        deviceId,
      })
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        txid: "txid-1",
        status: "INITIATED",
      },
    })

    await expect
      .poll(() =>
        evolu.loadQuery(accountTransactionsWithOnchainQuery(accountId))
      )
      .toMatchObject([
        {
          accountId,
          amount: -10_500,
          currency: "BTC",
          kind: "onchain",
          onchainAddress: validAddress,
          coopExitRequestId: "coop-exit-1",
          exitSpeed: "medium",
          feeSats: 500,
          txid: "txid-1",
          deviceId,
          source: "manual",
        },
      ])
  })

  test("debits the full balance when withdrawing all", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const accountId = await createSparkAccount({ evolu })
    const deps = {
      evolu,
      ...createDateDeps(),
      sparkWallet: {
        create: async () => ({
          withdraw: async () => ({
            id: "coop-exit-2",
            status: "INITIATED",
            txid: "txid-2",
          }),
        }),
      },
    } satisfies EvoluDep & DateDep & SparkWalletDep
    await using run = testCreateRun(deps)
    const exitSpeed: SparkExitSpeed = "fast"

    const result = await run(
      executeWithdrawal({
        accountId,
        onchainAddress: validAddress,
        amountSats: 50_000,
        withdrawAll: true,
        availableSats: 50_000,
        exitSpeed,
        feeQuote,
      })
    )

    expect(result.ok).toBe(true)

    await expect
      .poll(() =>
        evolu.loadQuery(accountTransactionsWithOnchainQuery(accountId))
      )
      .toMatchObject([
        {
          amount: -50_000,
          exitSpeed: "fast",
          feeSats: 800,
        },
      ])
  })

  test("fails when the wallet cannot complete the withdrawal request", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const accountId = await createSparkAccount({ evolu })
    const deps = {
      evolu,
      ...createDateDeps(),
      sparkWallet: {
        create: async () => ({
          withdraw: async () => null,
        }),
      },
    } satisfies EvoluDep & DateDep & SparkWalletDep
    await using run = testCreateRun(deps)
    const exitSpeed: SparkExitSpeed = "medium"

    const result = await run(
      executeWithdrawal({
        accountId,
        onchainAddress: validAddress,
        amountSats: 10_000,
        withdrawAll: false,
        availableSats: 100_000,
        exitSpeed,
        feeQuote,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "WithdrawalRequestFailed" },
    })
  })

  test("fails separately when the withdrawal transaction cannot be recorded", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const accountId = await createSparkAccount({ evolu })
    const deps = {
      evolu,
      ...createDateDeps(),
      sparkWallet: {
        create: async () => ({
          withdraw: async () => ({
            id: "",
            status: "INITIATED",
            txid: "txid-3",
          }),
        }),
      },
    } satisfies EvoluDep & DateDep & SparkWalletDep
    await using run = testCreateRun(deps)
    const exitSpeed: SparkExitSpeed = "medium"

    const result = await run(
      executeWithdrawal({
        accountId,
        onchainAddress: validAddress,
        amountSats: 10_000,
        withdrawAll: false,
        availableSats: 100_000,
        exitSpeed,
        feeQuote,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "WithdrawalRecordingFailed" },
    })
  })
})
