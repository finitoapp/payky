import { createTestInvoice } from "@payky/core/modules/shared/lightning-invoice-test-fixtures"
import type { SparkWalletDep } from "@payky/core/spark/spark-wallet"
import { createFakeSparkWallet } from "@payky/core/spark/spark-wallet-test-fixtures"
import { nativeEnv } from "../core/native-env.ts"

/**
 * Named fake Spark wallets for e2e: web's specs hand `window.__e2eSparkWallet`
 * function overrides to the page, but a deep link carries only a string, so
 * each scenario they build is a preset here, chosen by the `fake` bridge
 * action (`spark=<name>`).
 */
const presets = {
  /**
   * A funded wallet: it issues invoices (payment-spark), and quotes and pays
   * a withdrawal (withdraw.spec's `fakeSparkWallet`).
   */
  funded: {
    createLightningInvoice: async () => ({
      id: "e2e-receive-request",
      invoice: { encodedInvoice: createTestInvoice({ hrp: "lnbc10u" }) },
    }),
    getBalance: async () => ({ availableSats: 100_000 }),
    getLightningSendFeeEstimate: async () => 10,
    getIdentityPublicKey: async () => `03${"cd".repeat(32)}`,
    payLightningInvoice: async () => ({ kind: "sent" }),
    getTransfer: async () => false,
  },
} satisfies Record<string, Parameters<typeof createFakeSparkWallet>[0]>

export type E2eSparkPresetName = keyof typeof presets

export const e2eSparkPresetNames = Object.keys(presets) as [
  E2eSparkPresetName,
  ...E2eSparkPresetName[],
]

// Module state: it lives until the app restarts. On web a link reloads the
// page, so a flow selects the preset with the `fake` action's `next=`.
let active: E2eSparkPresetName | null = null

export const setE2eSparkPreset = (name: E2eSparkPresetName | null) => {
  active = name
}

/** The fake Spark wallet dep while a preset is active in an e2e build, else `null`. */
export const createE2eSparkWalletDep = (): SparkWalletDep | null => {
  if (!nativeEnv.EXPO_PUBLIC_PAYKY_E2E || active === null) return null
  const overrides = presets[active]
  return {
    sparkWallet: { create: async () => createFakeSparkWallet(overrides) },
  }
}
