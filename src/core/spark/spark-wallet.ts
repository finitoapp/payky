import { SparkWallet } from "@buildonspark/spark-sdk"

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
): Promise<SparkPaymentWallet> => {
  const { wallet } = await SparkWallet.getOrCreateWallet({
    mnemonicOrSeed: mnemonic,
    options: {
      network: "MAINNET",
    },
  })

  return {
    createLightningInvoice: (params) => wallet.createLightningInvoice(params),
    cleanup: () => wallet.cleanup(),
  }
}
