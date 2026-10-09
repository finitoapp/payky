import type {
  SparkPaymentWallet,
  SparkWalletDep,
} from "@/core/spark/spark-wallet.ts"

declare global {
  interface Window {
    /**
     * Set by an e2e spec (`page.addInitScript`) to answer the Spark wallet
     * calls a flow makes — e2e has no other way to reach a funded wallet.
     */
    __e2eSparkWallet?: Partial<SparkPaymentWallet>
  }
}

const notImplemented = (): never => {
  throw new Error("Not faked by the e2e spec.")
}

/**
 * A Spark wallet dep built from `window.__e2eSparkWallet`, or `null`. Inert
 * in anything shipped: the same `DEV || __E2E_TEST_BUILD__` gate as
 * `E2eTestBridge`'s, so a production build never reads the window flag.
 */
export const createE2eSparkWalletDep = (): SparkWalletDep | null => {
  if (!import.meta.env.DEV && !__E2E_TEST_BUILD__) return null
  if (typeof window === "undefined") return null
  const overrides = window.__e2eSparkWallet
  if (overrides === undefined) return null

  return {
    sparkWallet: {
      create: async () => ({
        createLightningInvoice: notImplemented,
        getWalletSettings: notImplemented,
        setPrivacyEnabled: notImplemented,
        getBalance: notImplemented,
        getWithdrawalFeeQuote: notImplemented,
        withdraw: notImplemented,
        getLightningSendFeeEstimate: notImplemented,
        payLightningInvoice: notImplemented,
        getTransfer: notImplemented,
        getIdentityPublicKey: notImplemented,
        getCoopExitRequest: notImplemented,
        ...overrides,
        [Symbol.asyncDispose]: async () => {},
      }),
    },
  }
}
