import { SparkWalletEvent } from "@buildonspark/spark-sdk"
import { ExitSpeed } from "@buildonspark/spark-sdk/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { SparkSecret } from "@/core/modules/shared/key-derivation.ts"

const { initializeMock } = vi.hoisted(() => ({ initializeMock: vi.fn() }))

vi.mock("@buildonspark/spark-sdk", () => ({
  SparkWallet: { initialize: initializeMock },
  SparkWalletEvent: {
    TransferClaimed: "transfer:claimed",
    BalanceUpdate: "balance:update",
    DepositConfirmed: "deposit:confirmed",
  },
}))

beforeEach(() => {
  initializeMock.mockClear()
})

const { createDefaultSparkPaymentWallet, createSharedSparkSyncWallet } =
  await import("./spark-wallet.ts")

let nextSecretValue = 0

const nextSecret = () => {
  nextSecretValue += 1
  return SparkSecret(nextSecretValue.toString(16).padStart(32, "0"))
}

const createFakeSdkWallet = (
  overrides: Partial<{
    readonly getBalance: () => Promise<unknown>
    readonly getWithdrawalFeeQuote: () => Promise<unknown>
    readonly withdraw: () => Promise<unknown>
  }> = {}
) => ({
  getBalance: vi.fn(async () => ({ satsBalance: { available: 0n } })),
  getWithdrawalFeeQuote: vi.fn(async () => null),
  withdraw: vi.fn(async () => null),
  createLightningInvoice: vi.fn(),
  getWalletSettings: vi.fn(),
  setPrivacyEnabled: vi.fn(),
  getTransfers: vi.fn(),
  getTransfer: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  cleanup: vi.fn(async () => undefined),
  ...overrides,
})

describe("createDefaultSparkPaymentWallet", () => {
  test("maps the SDK balance to availableSats as a number", async () => {
    const fakeWallet = createFakeSdkWallet({
      getBalance: vi.fn(async () => ({ satsBalance: { available: 12345n } })),
    })
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    await using wallet = await createDefaultSparkPaymentWallet(nextSecret())

    expect(await wallet.getBalance()).toEqual({ availableSats: 12345 })
  })

  test("maps a withdrawal fee quote from the SDK shape", async () => {
    const fakeWallet = createFakeSdkWallet({
      getWithdrawalFeeQuote: vi.fn(async () => ({
        id: "quote-1",
        expiresAt: "2026-01-01T00:00:00Z",
        userFeeFast: { originalValue: 10 },
        l1BroadcastFeeFast: { originalValue: 5 },
        userFeeMedium: { originalValue: 8 },
        l1BroadcastFeeMedium: { originalValue: 4 },
        userFeeSlow: { originalValue: 2 },
        l1BroadcastFeeSlow: { originalValue: 1 },
      })),
    })
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    await using wallet = await createDefaultSparkPaymentWallet(nextSecret())
    const quote = await wallet.getWithdrawalFeeQuote({
      amountSats: 1000,
      withdrawalAddress: "bc1qexample",
    })

    expect(quote).toEqual({
      id: "quote-1",
      expiresAt: "2026-01-01T00:00:00Z",
      fast: { userFeeSats: 10, l1BroadcastFeeSats: 5, totalFeeSats: 15 },
      medium: { userFeeSats: 8, l1BroadcastFeeSats: 4, totalFeeSats: 12 },
      slow: { userFeeSats: 2, l1BroadcastFeeSats: 1, totalFeeSats: 3 },
    })
  })

  test("returns null when the SDK returns no fee quote", async () => {
    const fakeWallet = createFakeSdkWallet()
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    await using wallet = await createDefaultSparkPaymentWallet(nextSecret())

    expect(
      await wallet.getWithdrawalFeeQuote({
        amountSats: 1000,
        withdrawalAddress: "bc1qexample",
      })
    ).toBeNull()
  })

  test("maps each SparkExitSpeed to the SDK enum when withdrawing", async () => {
    const fakeWithdraw = vi.fn(async () => ({
      id: "withdrawal-1",
      status: "PENDING",
      coopExitTxid: null,
    }))
    const fakeWallet = createFakeSdkWallet({ withdraw: fakeWithdraw })
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    await using wallet = await createDefaultSparkPaymentWallet(nextSecret())
    await wallet.withdraw({
      onchainAddress: "bc1qexample",
      exitSpeed: "medium",
      feeQuoteId: "quote-1",
      feeAmountSats: 5,
    })

    expect(fakeWithdraw).toHaveBeenCalledWith(
      expect.objectContaining({ exitSpeed: ExitSpeed.MEDIUM })
    )
  })

  test("maps a completed withdrawal's coopExitTxid to txid", async () => {
    const fakeWallet = createFakeSdkWallet({
      withdraw: vi.fn(async () => ({
        id: "withdrawal-1",
        status: "COMPLETED",
        coopExitTxid: "txid-1",
      })),
    })
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    await using wallet = await createDefaultSparkPaymentWallet(nextSecret())
    const result = await wallet.withdraw({
      onchainAddress: "bc1qexample",
      exitSpeed: "fast",
      feeQuoteId: "quote-1",
      feeAmountSats: 5,
    })

    expect(result).toEqual({
      id: "withdrawal-1",
      status: "COMPLETED",
      txid: "txid-1",
    })
  })

  test("returns null when the SDK rejects the withdrawal", async () => {
    const fakeWallet = createFakeSdkWallet()
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    await using wallet = await createDefaultSparkPaymentWallet(nextSecret())
    const result = await wallet.withdraw({
      onchainAddress: "bc1qexample",
      exitSpeed: "slow",
      feeQuoteId: "quote-1",
      feeAmountSats: 5,
    })

    expect(result).toBeNull()
  })
})

describe("Spark wallet pool sharing", () => {
  test("shares one SDK instance across concurrent leases for the same secret", async () => {
    const fakeWallet = createFakeSdkWallet()
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    const secret = nextSecret()
    await using walletA = await createDefaultSparkPaymentWallet(secret)
    await using walletB = await createDefaultSparkPaymentWallet(secret)

    await walletA.getBalance()
    await walletB.getBalance()

    expect(initializeMock).toHaveBeenCalledTimes(1)
    expect(fakeWallet.cleanup).not.toHaveBeenCalled()
  })

  test("creates separate SDK instances for different secrets", async () => {
    const fakeWalletA = createFakeSdkWallet()
    const fakeWalletB = createFakeSdkWallet()
    initializeMock.mockResolvedValueOnce({ wallet: fakeWalletA })
    initializeMock.mockResolvedValueOnce({ wallet: fakeWalletB })

    await using walletA = await createDefaultSparkPaymentWallet(nextSecret())
    await using walletB = await createDefaultSparkPaymentWallet(nextSecret())

    await walletA.getBalance()
    await walletB.getBalance()

    expect(fakeWalletA.getBalance).toHaveBeenCalledTimes(1)
    expect(fakeWalletB.getBalance).toHaveBeenCalledTimes(1)
  })

  test("destroys the SDK instance only once every lease is disposed", async () => {
    const fakeWallet = createFakeSdkWallet()
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    const secret = nextSecret()
    const walletA = await createDefaultSparkPaymentWallet(secret)
    const walletB = await createDefaultSparkPaymentWallet(secret)

    await walletA[Symbol.asyncDispose]()
    expect(fakeWallet.cleanup).not.toHaveBeenCalled()

    await walletB[Symbol.asyncDispose]()
    expect(fakeWallet.cleanup).toHaveBeenCalledTimes(1)
  })
})

describe("createSharedSparkSyncWallet", () => {
  test("subscribes only to the provided event handlers", async () => {
    const fakeWallet = createFakeSdkWallet()
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    await using syncWallet = await createSharedSparkSyncWallet(nextSecret())
    const balanceUpdateHandler = vi.fn()
    syncWallet.subscribe({
      [SparkWalletEvent.BalanceUpdate]: balanceUpdateHandler,
    })

    expect(fakeWallet.on).toHaveBeenCalledTimes(1)
    expect(fakeWallet.on).toHaveBeenCalledWith(
      "balance:update",
      balanceUpdateHandler
    )
  })

  test("unsubscribe removes exactly the handlers it registered", async () => {
    const fakeWallet = createFakeSdkWallet()
    initializeMock.mockResolvedValueOnce({ wallet: fakeWallet })

    await using syncWallet = await createSharedSparkSyncWallet(nextSecret())
    const balanceUpdateHandler = vi.fn()
    const transferClaimedHandler = vi.fn()
    const unsubscribe = syncWallet.subscribe({
      [SparkWalletEvent.BalanceUpdate]: balanceUpdateHandler,
      [SparkWalletEvent.TransferClaimed]: transferClaimedHandler,
    })

    unsubscribe()

    expect(fakeWallet.off).toHaveBeenCalledTimes(2)
    expect(fakeWallet.off).toHaveBeenCalledWith(
      "balance:update",
      balanceUpdateHandler
    )
    expect(fakeWallet.off).toHaveBeenCalledWith(
      "transfer:claimed",
      transferClaimedHandler
    )
  })
})
