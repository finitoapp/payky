import { SparkWallet } from "@buildonspark/spark-sdk"
import { z } from "zod"

const DonateWalletEnvSchema = z.object({
  PAYKY_DONATE_SPARK_MNEMONIC: z.string().trim().min(1),
})

export interface DonateWalletConfig {
  readonly mnemonic: string
}

export const loadDonateWalletConfig = (): DonateWalletConfig | null => {
  const parsedEnv = DonateWalletEnvSchema.safeParse(process.env)

  if (!parsedEnv.success) return null

  return { mnemonic: parsedEnv.data.PAYKY_DONATE_SPARK_MNEMONIC }
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
