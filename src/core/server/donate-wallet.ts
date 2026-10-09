import { SparkWallet } from "@buildonspark/spark-sdk"
import { createEnv } from "@t3-oss/env-core"

import {
  DonateSparkMnemonicSchema,
  loadServerEnv,
  throwInvalidServerEnv,
} from "./server-env.ts"

export interface DonateWalletConfig {
  readonly mnemonic: string
}

export const loadDonateWalletConfig = (): DonateWalletConfig | null => {
  const env = loadServerEnv(() =>
    createEnv({
      server: { PAYKY_DONATE_SPARK_MNEMONIC: DonateSparkMnemonicSchema },
      runtimeEnv: process.env,
      emptyStringAsUndefined: true,
      onValidationError: throwInvalidServerEnv,
    })
  )

  return env === null ? null : { mnemonic: env.PAYKY_DONATE_SPARK_MNEMONIC }
}

export type DonateWallet = Awaited<
  ReturnType<typeof SparkWallet.initialize>
>["wallet"]

export const createDonateWallet = async (
  config: DonateWalletConfig
): Promise<DonateWallet> => {
  const { wallet } = await SparkWallet.initialize({
    mnemonicOrSeed: config.mnemonic,
    options: {
      network: "MAINNET",
    },
  })

  return wallet
}
