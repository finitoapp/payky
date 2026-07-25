import type { SparkPaymentWallet } from "@/core/spark/spark-wallet.ts"

const notImplemented = (): never => {
  throw new Error("not implemented")
}

export const createFakeSparkWallet = (
  overrides: Partial<SparkPaymentWallet>
): SparkPaymentWallet => ({
  createLightningInvoice: notImplemented,
  getWalletSettings: notImplemented,
  setPrivacyEnabled: notImplemented,
  getBalance: notImplemented,
  getWithdrawalFeeQuote: notImplemented,
  withdraw: notImplemented,
  [Symbol.asyncDispose]: async () => {},
  ...overrides,
})
