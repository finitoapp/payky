import { createIdFromString, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  BitcoinAddress,
  NonEmptyString255,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import type {
  SparkExitSpeed,
  SparkWalletDep,
  SparkWithdrawalFeeQuote,
  SparkWithdrawalStatus,
} from "@/core/spark/spark-wallet.ts"
import { createFakeSparkWallet } from "@/core/spark/spark-wallet-test-fixtures.ts"
import { executeWithdrawal, quoteWithdrawal } from "./withdrawal-actions.ts"

const fixedDate = new Date("2026-06-05T12:00:00.000Z")
const validAddress = BitcoinAddress(
  "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
)

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

const createSparkAccount = async (
  deps: EvoluDep & EvoluOwnerIdDep,
  secret = SparkSecret("42373a7543db65ae0228ead6c9cbffcc")
): Promise<AccountId> => {
  await using run = testCreateRun(deps)
  const accountId = await run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Spark wallet"),
      spark: { secret },
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
    const accountId = await createSparkAccount({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })
    const deps = {
      evolu,
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
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
        amountSats: PositiveInteger(10_000),
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
    const accountId = await createSparkAccount({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })
    const deps = {
      evolu,
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
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
    const accountId = await createSparkAccount({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })
    const deps = {
      evolu,
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            getBalance: async () => ({ availableSats: 100_000 }),
            getWithdrawalFeeQuote: async () => feeQuote,
          }),
      },
    } satisfies EvoluDep & SparkWalletDep
    await using run = testCreateRun(deps)

    const result = await run(
      quoteWithdrawal({
        accountId,
        onchainAddress: "not-a-bitcoin-address" as BitcoinAddress,
        amountSats: PositiveInteger(10_000),
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
    const accountId = await createSparkAccount({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })
    const deps = {
      evolu,
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
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
        amountSats: PositiveInteger(10_000),
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "InsufficientWithdrawalBalance" },
    })
  })

  test("opens the wallet of the requested account, not of another one", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const evoluDeps = { evolu, evoluOwnerId: evolu.appOwner.id }
    // Two Spark accounts, so which secret reaches `sparkWallet.create` is a
    // real question. Nothing else covers it: every other test here has one
    // account, where selecting the wrong row is indistinguishable from
    // selecting the right one.
    const otherSecret = SparkSecret("0f9b1c2d3e4f50617283949a5b6c7d8e")
    await createSparkAccount(evoluDeps, otherSecret)
    const accountId = await createSparkAccount(evoluDeps)

    const openedSecrets: string[] = []
    const deps = {
      evolu,
      sparkWallet: {
        create: async (secret: SparkSecret) => {
          openedSecrets.push(secret)
          return createFakeSparkWallet({
            getBalance: async () => ({ availableSats: 100_000 }),
            getWithdrawalFeeQuote: async () => feeQuote,
          })
        },
      },
    } satisfies EvoluDep & SparkWalletDep
    await using run = testCreateRun(deps)

    await expect(
      run(
        quoteWithdrawal({
          accountId,
          onchainAddress: validAddress,
          amountSats: PositiveInteger(10_000),
        })
      )
    ).resolves.toMatchObject({ ok: true })

    expect(openedSecrets).toEqual(["42373a7543db65ae0228ead6c9cbffcc"])
    expect(otherSecret).not.toBe("42373a7543db65ae0228ead6c9cbffcc")
  })

  test("fails for an unknown account", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
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
        amountSats: PositiveInteger(10_000),
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
    const accountId = await createSparkAccount({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            withdraw: async () => ({
              id: "coop-exit-1",
              status: "INITIATED" as SparkWithdrawalStatus,
              txid: "txid-1",
            }),
          }),
      },
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep & SparkWalletDep
    await using run = testCreateRun(deps)
    const exitSpeed: SparkExitSpeed = "medium"
    const deviceId = createIdFromString<"Device">("withdrawal-test-device")

    const result = await run(
      executeWithdrawal({
        accountId,
        onchainAddress: validAddress,
        quote: {
          amountSats: 10_000,
          withdrawAll: false,
          availableSats: 100_000,
          feeQuote,
        },
        exitSpeed,
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
    const accountId = await createSparkAccount({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            withdraw: async () => ({
              id: "coop-exit-2",
              status: "INITIATED" as SparkWithdrawalStatus,
              txid: "txid-2",
            }),
          }),
      },
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep & SparkWalletDep
    await using run = testCreateRun(deps)
    const exitSpeed: SparkExitSpeed = "fast"

    const result = await run(
      executeWithdrawal({
        accountId,
        onchainAddress: validAddress,
        quote: {
          amountSats: 50_000,
          withdrawAll: true,
          availableSats: 50_000,
          feeQuote,
        },
        exitSpeed,
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
    const accountId = await createSparkAccount({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            withdraw: async () => null,
          }),
      },
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep & SparkWalletDep
    await using run = testCreateRun(deps)
    const exitSpeed: SparkExitSpeed = "medium"

    const result = await run(
      executeWithdrawal({
        accountId,
        onchainAddress: validAddress,
        quote: {
          amountSats: 10_000,
          withdrawAll: false,
          availableSats: 100_000,
          feeQuote,
        },
        exitSpeed,
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
    const accountId = await createSparkAccount({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            withdraw: async () => ({
              id: "",
              status: "INITIATED" as SparkWithdrawalStatus,
              txid: "txid-3",
            }),
          }),
      },
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep & SparkWalletDep
    await using run = testCreateRun(deps)
    const exitSpeed: SparkExitSpeed = "medium"

    const result = await run(
      executeWithdrawal({
        accountId,
        onchainAddress: validAddress,
        quote: {
          amountSats: 10_000,
          withdrawAll: false,
          availableSats: 100_000,
          feeQuote,
        },
        exitSpeed,
      })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "WithdrawalRecordingFailed" },
    })
  })
})
