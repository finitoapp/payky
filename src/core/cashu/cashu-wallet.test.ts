import { describe, expect, test } from "vitest"

import { createMemoryCashuKeyValueStorage } from "@/core/cashu/cashu-key-value-store.ts"
import {
  CashuWalletError,
  createCashuWallet,
} from "@/core/cashu/cashu-wallet.ts"
import {
  createInMemoryLinkyStore,
  testLinkyMasterKey,
} from "@/core/linky/linky-store-test-fixtures.ts"
import {
  cashuMnemonicToWalletSeed,
  deriveDefaultCashuWalletMnemonic,
} from "@/core/modules/shared/key-derivation.ts"

const testSeed = cashuMnemonicToWalletSeed(
  deriveDefaultCashuWalletMnemonic(testLinkyMasterKey)
)

const createTestWallet = async () => {
  const linkyStore = await createInMemoryLinkyStore()
  const wallet = createCashuWallet({
    seed: testSeed,
    storage: createMemoryCashuKeyValueStorage(),
    loadStores: async () => linkyStore.wallet,
  })
  return { linkyStore, wallet }
}

describe("cashu wallet", () => {
  test("an empty Linky inventory has no balance and nothing to watch", async () => {
    const { linkyStore, wallet } = await createTestWallet()
    await using _store = linkyStore
    await using _wallet = wallet

    await expect(wallet.getBalances()).resolves.toEqual({
      totalSats: 0,
      spendableSats: 0,
      perMint: [],
    })
    await expect(wallet.watchPendingTopups()).resolves.toBeUndefined()
  })

  test("refuses a mint url the library would not accept", async () => {
    const { linkyStore, wallet } = await createTestWallet()
    await using _store = linkyStore
    await using _wallet = wallet

    await expect(
      wallet.startTopup({ mintUrl: "not a url", amountSats: 21 })
    ).rejects.toBeInstanceOf(CashuWalletError)
  })

  test("reports an unreachable mint instead of failing a restore", async () => {
    const { linkyStore, wallet } = await createTestWallet()
    await using _store = linkyStore
    await using _wallet = wallet

    const report = await wallet.restore({ mintUrls: ["http://127.0.0.1:9"] })

    expect(report.restoredProofs).toBe(0)
    expect(report.unavailableMints).toEqual(["http://127.0.0.1:9"])
  }, 30_000)
})
