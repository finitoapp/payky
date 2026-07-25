import {
  SparkWallet,
  SparkWalletEvent,
  type SparkWalletEvents,
} from "@buildonspark/spark-sdk"
import { ExitSpeed } from "@buildonspark/spark-sdk/types"
import { createRefCountedResourcePool } from "@/lib/ref-counted-resource-pool.ts"

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

export interface SparkPaymentWallet extends AsyncDisposable {
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

const toFeeEstimate = (
  userFee: { readonly originalValue: number },
  l1BroadcastFee: { readonly originalValue: number }
): SparkWithdrawalFeeEstimate => ({
  userFeeSats: userFee.originalValue,
  l1BroadcastFeeSats: l1BroadcastFee.originalValue,
  totalFeeSats: userFee.originalValue + l1BroadcastFee.originalValue,
})

/**
 * Instances are keyed by mnemonic and shared across every consumer (domain
 * actions, direct UI reads, and the Spark account sync job). Sharing is
 * ref-counted through {@link createRefCountedResourcePool}: each `acquire()`
 * call returns its own disposable lease, and the underlying instance is only
 * torn down once every acquirer has disposed its lease (e.g. a short-lived
 * action's `finally` cleanup, or the sync job disposing its long-held lease
 * when an account becomes inactive). This keeps the instance alive across a
 * burst of calls for the same account without ever outliving its last
 * consumer.
 *
 * Deliberately uses {@link SparkWallet.initialize}, not
 * `SparkWallet.getOrCreateWallet` — the latter dedupes concurrent
 * initialization through the SDK's own identity-keyed singleton registry,
 * which is redundant here (this pool already dedupes concurrent `acquire()`
 * calls for the same mnemonic) and can race with the pool's own teardown:
 * `getOrCreateWallet` can hand a new acquirer the very instance this pool is
 * concurrently disposing, since the two lifecycle mechanisms aren't
 * synchronized. `initialize` always constructs a fresh instance that this
 * pool exclusively owns, which avoids that race entirely.
 */
const sparkWalletPool = createRefCountedResourcePool<SparkWallet>({
  create: (mnemonic) =>
    SparkWallet.initialize({
      mnemonicOrSeed: mnemonic,
      options: {
        network: "MAINNET",
      },
    }).then(({ wallet }) => wallet),
  destroy: (wallet) => wallet.cleanup(),
})

const SUPPORTED_SYNC_EVENTS = [
  SparkWalletEvent.TransferClaimed,
  SparkWalletEvent.BalanceUpdate,
  SparkWalletEvent.DepositConfirmed,
] as const

export type SharedSparkSyncWalletEventHandlers = Partial<
  Pick<SparkWalletEvents, (typeof SUPPORTED_SYNC_EVENTS)[number]>
>

export interface SharedSparkSyncWallet extends AsyncDisposable {
  readonly getTransfers: (
    limit?: number,
    offset?: number,
    createdAfter?: Date,
    createdBefore?: Date
  ) => ReturnType<SparkWallet["getTransfers"]>
  readonly getTransfer: (id: string) => ReturnType<SparkWallet["getTransfer"]>
  /** Subscribes to sync-relevant events on the shared instance; returns an unsubscribe function. */
  readonly subscribe: (
    handlers: SharedSparkSyncWalletEventHandlers
  ) => () => void
}

export const createSharedSparkSyncWallet = async (
  mnemonic: string
): Promise<SharedSparkSyncWallet> => {
  const lease = sparkWalletPool.acquire(mnemonic)
  const wallet = await lease.resource

  return {
    getTransfers: (limit, offset, createdAfter, createdBefore) =>
      wallet.getTransfers(limit, offset, createdAfter, createdBefore),
    getTransfer: (id) => wallet.getTransfer(id),
    subscribe: (handlers) => {
      const entries = SUPPORTED_SYNC_EVENTS.flatMap((event) => {
        const listener = handlers[event]
        return listener === undefined ? [] : [[event, listener] as const]
      })

      // Each pair's event and listener always correspond (built from the
      // same `handlers[event]` lookup above), but the union collapses once
      // stored in a shared array, so TS can no longer verify it structurally.
      for (const [event, listener] of entries) {
        wallet.on(event, listener as never)
      }

      return () => {
        for (const [event, listener] of entries) {
          wallet.off(event, listener as never)
        }
      }
    },
    [Symbol.asyncDispose]: lease[Symbol.asyncDispose],
  }
}

export const createDefaultSparkPaymentWallet = async (
  mnemonic: string
): Promise<SparkPaymentWallet> => {
  const lease = sparkWalletPool.acquire(mnemonic)
  const wallet = await lease.resource

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
    [Symbol.asyncDispose]: lease[Symbol.asyncDispose],
  }
}
