import { SparkWallet } from "@buildonspark/spark-sdk"
import { ExitSpeed } from "@buildonspark/spark-sdk/types"

import {
  type SparkSecret,
  sparkSecretToMnemonic,
} from "@/core/modules/shared/key-derivation.ts"

export interface SparkWalletSettings {
  readonly ownerIdentityPublicKey: string
  readonly privateEnabled: boolean
}

interface SparkLightningInvoice {
  readonly id?: string | null
  readonly invoice: {
    readonly encodedInvoice: string
    readonly paymentHash?: string | null
  }
  readonly paymentPreimage?: string | null
  readonly sparkInvoice?: string | null
}

export type SparkExitSpeed = "fast" | "medium" | "slow"

const exitSpeedToSdk: Record<SparkExitSpeed, ExitSpeed> = {
  fast: ExitSpeed.FAST,
  medium: ExitSpeed.MEDIUM,
  slow: ExitSpeed.SLOW,
}

export interface SparkWithdrawalFeeEstimate {
  readonly userFeeSats: number
  readonly l1BroadcastFeeSats: number
  readonly totalFeeSats: number
}

export interface SparkWithdrawalFeeQuote {
  readonly id: string
  readonly expiresAt: string
  readonly fast: SparkWithdrawalFeeEstimate
  readonly medium: SparkWithdrawalFeeEstimate
  readonly slow: SparkWithdrawalFeeEstimate
}

export interface SparkWithdrawalRequest {
  readonly id: string
  readonly status: string
  readonly txid: string | null
}

export interface SparkWalletBalance {
  readonly availableSats: number
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
  readonly getBalance: () => Promise<SparkWalletBalance>
  readonly getWithdrawalFeeQuote: (params: {
    readonly amountSats: number
    readonly withdrawalAddress: string
  }) => Promise<SparkWithdrawalFeeQuote | null>
  readonly withdraw: (params: {
    readonly onchainAddress: string
    readonly exitSpeed: SparkExitSpeed
    readonly feeQuoteId: string
    readonly feeAmountSats: number
    readonly amountSats?: number
    readonly deductFeeFromWithdrawalAmount?: boolean
  }) => Promise<SparkWithdrawalRequest | null>
  readonly cleanup?: () => void | Promise<void>
}

export type SparkWalletDep = {
  readonly sparkWallet: {
    readonly create: (secret: SparkSecret) => Promise<SparkPaymentWallet>
  }
}

export const createSparkWalletDep = () => {
  return {
    sparkWallet: {
      create: createDefaultSparkPaymentWallet,
    },
  }
}

const toFeeEstimate = (
  userFee: { readonly originalValue: number },
  l1BroadcastFee: { readonly originalValue: number }
): SparkWithdrawalFeeEstimate => ({
  userFeeSats: userFee.originalValue,
  l1BroadcastFeeSats: l1BroadcastFee.originalValue,
  totalFeeSats: userFee.originalValue + l1BroadcastFee.originalValue,
})

export const createDefaultSparkPaymentWallet = async (
  secret: SparkSecret
): Promise<SparkPaymentWallet & AsyncDisposable> => {
  const { wallet } = await SparkWallet.initialize({
    mnemonicOrSeed: sparkSecretToMnemonic(secret),
    options: {
      network: "MAINNET",
    },
  })

  return {
    createLightningInvoice: (params) => wallet.createLightningInvoice(params),
    getWalletSettings: () => wallet.getWalletSettings(),
    setPrivacyEnabled: (privacyEnabled) =>
      wallet.setPrivacyEnabled(privacyEnabled),
    getBalance: async () => {
      const balance = await wallet.getBalance()
      return { availableSats: Number(balance.satsBalance.available) }
    },
    getWithdrawalFeeQuote: async (params) => {
      const quote = await wallet.getWithdrawalFeeQuote(params)
      if (!quote) return null

      return {
        id: quote.id,
        expiresAt: quote.expiresAt,
        fast: toFeeEstimate(quote.userFeeFast, quote.l1BroadcastFeeFast),
        medium: toFeeEstimate(quote.userFeeMedium, quote.l1BroadcastFeeMedium),
        slow: toFeeEstimate(quote.userFeeSlow, quote.l1BroadcastFeeSlow),
      }
    },
    withdraw: async ({
      onchainAddress,
      exitSpeed,
      feeQuoteId,
      feeAmountSats,
      amountSats,
      deductFeeFromWithdrawalAmount,
    }) => {
      const result = await wallet.withdraw({
        onchainAddress,
        exitSpeed: exitSpeedToSdk[exitSpeed],
        feeQuoteId,
        feeAmountSats,
        amountSats,
        deductFeeFromWithdrawalAmount,
      })
      if (!result) return null

      return {
        id: result.id,
        status: result.status,
        txid: result.coopExitTxid ?? null,
      }
    },
    cleanup: () => wallet.cleanup(),
    [Symbol.asyncDispose]: () => wallet.cleanup(),
  }
}
