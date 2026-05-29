import { SparkWalletEvent } from "@buildonspark/spark-sdk"
import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createSparkAccountTransactionSyncJob } from "./spark-account-transaction-sync-job.ts"

const sparkTransactionsByAccountIdQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .innerJoin(
        "accountTransactionSpark",
        "accountTransactionSpark.id",
        "accountTransaction.id"
      )
      .select([
        "accountTransaction.accountId",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransaction.occurredAt",
        "accountTransaction.note",
        "accountTransactionSpark.sparkTransferId",
        "accountTransactionSpark.lnInvoice",
        "accountTransactionSpark.preImage",
        "accountTransactionSpark.paymentHash",
      ])
      .where("accountTransaction.accountId", "=", accountId)
      .where("accountTransaction.isDeleted", "is not", 1)
  )

interface FakeTransfer {
  readonly id: string
  readonly status: string
  readonly totalValue: number
  readonly transferDirection: string
  readonly updatedTime: Date | undefined
  readonly createdTime: Date | undefined
  readonly sparkInvoice: string | undefined
  readonly userRequest: unknown
}

class FakeSparkWallet {
  readonly cleanups: unknown[] = []
  private readonly listeners = new Map<
    string,
    Set<(...args: ReadonlyArray<unknown>) => void>
  >()

  constructor(private readonly transfers: ReadonlyArray<FakeTransfer>) {}

  async getTransfers(limit = 20, offset = 0) {
    const transfers = this.transfers.slice(offset, offset + limit)
    const nextOffset =
      offset + transfers.length < this.transfers.length
        ? offset + transfers.length
        : offset

    return {
      transfers,
      offset: nextOffset,
    }
  }

  async getTransfer(id: string) {
    return this.transfers.find((transfer) => transfer.id === id)
  }

  on(event: string, listener: (...args: ReadonlyArray<unknown>) => void): void {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  off(
    event: string,
    listener: (...args: ReadonlyArray<unknown>) => void
  ): void {
    this.listeners.get(event)?.delete(listener)
  }

  async cleanup(): Promise<void> {
    this.cleanups.push(null)
  }

  emit(event: string, ...args: ReadonlyArray<unknown>): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }
}

const createCompletedTransfer = (
  override: Partial<FakeTransfer> = {}
): FakeTransfer => ({
  id: "spark-transfer-1",
  status: "TRANSFER_STATUS_COMPLETED",
  totalValue: 1234,
  transferDirection: "INCOMING",
  updatedTime: new Date("2026-05-27T10:00:00Z"),
  createdTime: new Date("2026-05-27T09:59:00Z"),
  sparkInvoice: "spark-invoice-1",
  userRequest: {
    invoice: {
      encodedInvoice: "lnbc1invoice",
      paymentHash: "payment-hash-1",
      memo: "Table 1",
    },
    paymentPreimage: "preimage-1",
  },
  ...override,
})

const createUniqueHexSeed = (): string =>
  `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
    .padEnd(64, "0")
    .slice(0, 64)

describe("spark account transaction sync job", () => {
  test("stores completed Spark transfers from the periodic history check without duplicates", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const errors: unknown[] = []
    const mnemonic = createUniqueHexSeed()
    const accountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Spark account",
        spark: {
          mnemonic,
        },
      })
    )
    const transferId = `spark-transfer-${accountId}`
    const wallet = new FakeSparkWallet([
      createCompletedTransfer({
        id: transferId,
      }),
    ])
    using _job = createSparkAccountTransactionSyncJob({
      walletFactory: async (receivedMnemonic) =>
        receivedMnemonic === mnemonic ? wallet : new FakeSparkWallet([]),
      recheckIntervalMs: 10,
    })({
      evolu,
      onError: (error) => {
        errors.push(error)
      },
    })

    await expect
      .poll(() => evolu.loadQuery(sparkTransactionsByAccountIdQuery(accountId)))
      .toEqual([
        {
          accountId,
          amount: 1234,
          currency: "BTC",
          occurredAt: new Date("2026-05-27T10:00:00Z").getTime(),
          note: "Table 1",
          sparkTransferId: transferId,
          lnInvoice: "lnbc1invoice",
          preImage: "preimage-1",
          paymentHash: "payment-hash-1",
        },
      ])

    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(
      await evolu.loadQuery(sparkTransactionsByAccountIdQuery(accountId))
    ).toHaveLength(1)
    expect(errors).toEqual([])
  })

  test("records a claimed transfer live and removes listeners on dispose", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const errors: unknown[] = []
    const mnemonic = createUniqueHexSeed()
    const accountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Spark account",
        spark: {
          mnemonic,
        },
      })
    )
    const transferId = `spark-transfer-live-${accountId}`
    const wallet = new FakeSparkWallet([
      createCompletedTransfer({
        id: transferId,
        totalValue: 2100,
        transferDirection: "OUTGOING",
        userRequest: undefined,
      }),
    ])
    {
      using _job = createSparkAccountTransactionSyncJob({
        walletFactory: async (receivedMnemonic) =>
          receivedMnemonic === mnemonic ? wallet : new FakeSparkWallet([]),
        recheckIntervalMs: 60_000,
      })({
        evolu,
        onError: (error) => {
          errors.push(error)
        },
      })

      wallet.emit(SparkWalletEvent.TransferClaimed, transferId)

      await expect
        .poll(() =>
          evolu.loadQuery(sparkTransactionsByAccountIdQuery(accountId))
        )
        .toMatchObject([
          {
            amount: -2100,
            sparkTransferId: transferId,
            lnInvoice: "spark-invoice-1",
            preImage: transferId,
            paymentHash: transferId,
          },
        ])
    }

    wallet.emit(SparkWalletEvent.TransferClaimed, transferId)

    expect(wallet.cleanups).toHaveLength(1)
    expect(errors).toEqual([])
  })

  test("skips invalid Spark account secrets without starting a wallet", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const errors: unknown[] = []
    const startedWallets: string[] = []
    const invalidMnemonic = `test spark mnemonic ${Date.now()}`
    await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Invalid Spark account",
        spark: {
          mnemonic: invalidMnemonic,
        },
      })
    )
    using _job = createSparkAccountTransactionSyncJob({
      walletFactory: async (mnemonic) => {
        startedWallets.push(mnemonic)
        return new FakeSparkWallet([])
      },
      recheckIntervalMs: 10,
    })({
      evolu,
      onError: (error) => {
        errors.push(error)
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(startedWallets).not.toContain(invalidMnemonic)
    expect(errors).toEqual([])
  })
})
