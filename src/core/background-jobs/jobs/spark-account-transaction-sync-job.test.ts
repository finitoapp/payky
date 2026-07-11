import {
  SparkWalletEvent,
  type SparkWalletEvents,
} from "@buildonspark/spark-sdk"
import { testCreateConsole, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createInProcessLockManager } from "@/core/cli/in-process-lock-manager.ts"
import type { DateDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createSparkAccountTransactionSyncJob } from "./spark-account-transaction-sync-job.ts"

const fixedDate = new Date("2026-06-05T12:00:00.000Z")

const createDateDeps = (): DateDep => ({
  date: {
    now: () => fixedDate,
  },
})

const sparkTransactionsByAccountIdQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .innerJoin(
        "accountTransactionSpark",
        "accountTransactionSpark.id",
        "accountTransaction.id"
      )
      .leftJoin(
        "accountTransactionLightning",
        "accountTransactionLightning.id",
        "accountTransaction.id"
      )
      .leftJoin(
        "accountTransactionSparkInvoice",
        "accountTransactionSparkInvoice.id",
        "accountTransaction.id"
      )
      .select([
        "accountTransaction.accountId",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransaction.occurredAt",
        "accountTransaction.note",
        "accountTransactionSpark.sparkTransferId",
        "accountTransactionLightning.lnInvoice",
        "accountTransactionSparkInvoice.sparkInvoice",
        "accountTransactionLightning.preImage",
        "accountTransactionLightning.paymentHash",
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
  readonly lnInvoice?: string | undefined
  readonly sparkInvoice: string | undefined
  readonly userRequest: unknown
}

class FakeSparkWallet {
  readonly cleanups: unknown[] = []
  readonly getTransferIds: string[] = []
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
    this.getTransferIds.push(id)
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

  configureEvents(events: Partial<SparkWalletEvents>): void {
    for (const [event, listener] of Object.entries(events)) {
      if (listener === undefined) continue

      this.on(event, listener as (...args: ReadonlyArray<unknown>) => void)
    }
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0
  }

  async cleanup(): Promise<void> {
    this.cleanups.push(null)
    this.listeners.clear()
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

const createFakeWalletFactory =
  (mnemonic: string, wallet: FakeSparkWallet) =>
  async (
    receivedMnemonic: string,
    events: Partial<SparkWalletEvents>
  ): Promise<FakeSparkWallet> => {
    const selectedWallet =
      receivedMnemonic === mnemonic ? wallet : new FakeSparkWallet([])
    selectedWallet.configureEvents(events)
    return selectedWallet
  }

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
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      ...createDateDeps(),
      lockManager: createInProcessLockManager(),
      onError: (error) => {
        errors.push(error)
      },
    })
    await using _job = await jobRun.orThrow(
      createSparkAccountTransactionSyncJob({
        walletFactory: createFakeWalletFactory(mnemonic, wallet),
        recheckIntervalMs: 10,
      })
    )

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
          sparkInvoice: "spark-invoice-1",
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
      }),
    ])
    {
      await using jobRun = testCreateRun({
        console: testCreateConsole(),
        evolu,
        ...createDateDeps(),
        lockManager: createInProcessLockManager(),
        onError: (error) => {
          errors.push(error)
        },
      })
      await using _job = await jobRun.orThrow(
        createSparkAccountTransactionSyncJob({
          walletFactory: createFakeWalletFactory(mnemonic, wallet),
          recheckIntervalMs: 60_000,
        })
      )

      await expect
        .poll(() => wallet.listenerCount(SparkWalletEvent.TransferClaimed))
        .toBe(1)

      wallet.emit(SparkWalletEvent.TransferClaimed, transferId)

      await expect
        .poll(() =>
          evolu.loadQuery(sparkTransactionsByAccountIdQuery(accountId))
        )
        .toMatchObject([
          {
            amount: -2100,
            sparkTransferId: transferId,
            lnInvoice: "lnbc1invoice",
            sparkInvoice: "spark-invoice-1",
            preImage: "preimage-1",
            paymentHash: "payment-hash-1",
          },
        ])
    }

    wallet.emit(SparkWalletEvent.TransferClaimed, transferId)

    expect(wallet.cleanups).toHaveLength(1)
    expect(errors).toEqual([])
  })

  test("records a transfer claimed while the Spark wallet is initializing", async () => {
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
    const transferId = `spark-transfer-during-init-${accountId}`
    const wallet = new FakeSparkWallet([
      createCompletedTransfer({
        id: transferId,
      }),
    ])
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      ...createDateDeps(),
      lockManager: createInProcessLockManager(),
      onError: (error) => {
        errors.push(error)
      },
    })
    await using _job = await jobRun.orThrow(
      createSparkAccountTransactionSyncJob({
        walletFactory: async (receivedMnemonic, events) => {
          const selectedWallet =
            receivedMnemonic === mnemonic ? wallet : new FakeSparkWallet([])
          selectedWallet.configureEvents(events)
          selectedWallet.emit(SparkWalletEvent.TransferClaimed, transferId)
          return selectedWallet
        },
        recheckIntervalMs: 60_000,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(sparkTransactionsByAccountIdQuery(accountId)))
      .toMatchObject([
        {
          amount: 1234,
          sparkTransferId: transferId,
        },
      ])
    expect(wallet.getTransferIds).toContain(transferId)
    expect(errors).toEqual([])
  })

  test("records completed Spark transfers without a BOLT11 invoice when Spark invoice exists", async () => {
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
    const transferId = `spark-transfer-without-bolt11-${accountId}`
    const wallet = new FakeSparkWallet([
      createCompletedTransfer({
        id: transferId,
        userRequest: undefined,
      }),
    ])
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      ...createDateDeps(),
      lockManager: createInProcessLockManager(),
      onError: (error) => {
        errors.push(error)
      },
    })
    await using _job = await jobRun.orThrow(
      createSparkAccountTransactionSyncJob({
        walletFactory: createFakeWalletFactory(mnemonic, wallet),
        recheckIntervalMs: 10,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(sparkTransactionsByAccountIdQuery(accountId)))
      .toEqual([
        {
          accountId,
          amount: 1234,
          currency: "BTC",
          occurredAt: new Date("2026-05-27T10:00:00Z").getTime(),
          note: null,
          sparkTransferId: transferId,
          lnInvoice: null,
          sparkInvoice: "spark-invoice-1",
          preImage: null,
          paymentHash: null,
        },
      ])

    expect(errors).toEqual([])
  })

  test("ignores completed Spark transfers without a Spark or BOLT11 invoice", async () => {
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
    const transferId = `spark-transfer-without-identifier-${accountId}`
    const wallet = new FakeSparkWallet([
      createCompletedTransfer({
        id: transferId,
        sparkInvoice: undefined,
        userRequest: undefined,
      }),
    ])
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      ...createDateDeps(),
      lockManager: createInProcessLockManager(),
      onError: (error) => {
        errors.push(error)
      },
    })
    await using _job = await jobRun.orThrow(
      createSparkAccountTransactionSyncJob({
        walletFactory: createFakeWalletFactory(mnemonic, wallet),
        recheckIntervalMs: 10,
      })
    )

    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(
      await evolu.loadQuery(sparkTransactionsByAccountIdQuery(accountId))
    ).toEqual([])
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
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      ...createDateDeps(),
      lockManager: createInProcessLockManager(),
      onError: (error) => {
        errors.push(error)
      },
    })
    await using _job = await jobRun.orThrow(
      createSparkAccountTransactionSyncJob({
        walletFactory: async (mnemonic) => {
          startedWallets.push(mnemonic)
          return new FakeSparkWallet([])
        },
        recheckIntervalMs: 10,
      })
    )

    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(startedWallets).not.toContain(invalidMnemonic)
    expect(errors).toEqual([])
  })
})
