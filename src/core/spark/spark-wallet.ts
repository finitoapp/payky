import { SparkWallet } from "@buildonspark/spark-sdk"

export interface SparkWalletSettings {
  readonly ownerIdentityPublicKey: string
  readonly privateEnabled: boolean
}

interface SparkLightningInvoice {
  readonly id?: string
  readonly invoice: {
    readonly encodedInvoice: string
    readonly paymentHash?: string
  }
  readonly paymentPreimage?: string
  readonly sparkInvoice?: string
}

export interface SparkPaymentWallet {
  readonly createLightningInvoice: (params: {
    readonly amountSats: number
    readonly memo?: string
    readonly expirySeconds?: number
    readonly includeSparkInvoice?: boolean
  }) => Promise<SparkLightningInvoice>
  readonly getWalletSettings: () => Promise<SparkWalletSettings | undefined>
  readonly setPrivacyEnabled: (
    privacyEnabled: boolean
  ) => Promise<SparkWalletSettings | undefined>
  readonly cleanup?: () => void | Promise<void>
}

export type SparkWalletDep = {
  readonly sparkWallet: {
    readonly create: (mnemonic: string) => Promise<SparkPaymentWallet>
  }
}

export const createSparkWalletDep = () => {
  return {
    sparkWallet: {
      create: createDefaultSparkPaymentWallet,
    },
  }
}

export const createDefaultSparkPaymentWallet = async (
  mnemonic: string
): Promise<SparkPaymentWallet & AsyncDisposable> => {
  const { wallet } = await SparkWallet.initialize({
    mnemonicOrSeed: mnemonic,
    options: {
      network: "MAINNET",
    },
  })

  return {
    createLightningInvoice: (params) => wallet.createLightningInvoice(params),
    getWalletSettings: () => wallet.getWalletSettings(),
    setPrivacyEnabled: (privacyEnabled) =>
      wallet.setPrivacyEnabled(privacyEnabled),
    cleanup: () => wallet.cleanup(),
    [Symbol.asyncDispose]: () => wallet.cleanup(),
  }
}
