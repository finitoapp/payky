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

describe("cashu wallet tokens", () => {
  const proofs = [
    { id: "00ad268c4d1f5826", amount: 8, secret: "secret-a", C: "02ab" },
    { id: "00ad268c4d1f5826", amount: 2, secret: "secret-b", C: "02cd" },
  ]

  test("turns a NUT-18 payload's proofs into a token the wallet describes at face value", async () => {
    const { linkyStore, wallet } = await createTestWallet()
    await using _store = linkyStore
    await using _wallet = wallet

    const tokenText = await wallet.encodeToken({
      mintUrl: "https://mint.example.com/",
      unit: "sat",
      proofs,
    })

    expect(tokenText?.startsWith("cashuB")).toBe(true)
    await expect(wallet.describeToken(`cashu:${tokenText}`)).resolves.toEqual({
      tokenText,
      mintUrl: "https://mint.example.com",
      amountSats: 10,
    })
    await expect(
      wallet.findReceivedTransfer(tokenText ?? "")
    ).resolves.toBeNull()
  })

  test("describes nothing in a chat line and refuses proofs without a mint", async () => {
    const { linkyStore, wallet } = await createTestWallet()
    await using _store = linkyStore
    await using _wallet = wallet

    await expect(wallet.describeToken("thanks!")).resolves.toBeNull()
    await expect(
      wallet.encodeToken({ mintUrl: "not a url", unit: "sat", proofs })
    ).resolves.toBeNull()
  })
})
