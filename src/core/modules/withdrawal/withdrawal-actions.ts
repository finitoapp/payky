import { err, ok, type Task } from "@evolu/common"
import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import { activeSparkAccountByIdQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { isValidBitcoinAddress } from "@/core/modules/shared/bitcoin-address-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  type BitcoinAddress,
  Integer,
  NonEmptyStringSchema,
  type PositiveInteger,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import type {
  SparkExitSpeed,
  SparkWalletDep,
  SparkWithdrawalFeeQuote,
  SparkWithdrawalStatus,
} from "@/core/spark/spark-wallet.ts"
import { computeTotalDebitedSats } from "./withdrawal-utils.ts"

export interface WithdrawalQuote {
  readonly availableSats: number
  readonly amountSats: number
  readonly withdrawAll: boolean
  readonly feeQuote: SparkWithdrawalFeeQuote
}

const createWithdrawalAccountNotFoundError = defineError(
  "WithdrawalAccountNotFound"
)<{
  readonly accountId: AccountId
}>()
export type WithdrawalAccountNotFoundError = ReturnType<
  typeof createWithdrawalAccountNotFoundError
>

const createInvalidBitcoinAddressError = defineError("InvalidBitcoinAddress")<{
  readonly address: string
}>()
export type InvalidBitcoinAddressError = ReturnType<
  typeof createInvalidBitcoinAddressError
>

const createInsufficientWithdrawalBalanceError = defineError(
  "InsufficientWithdrawalBalance"
)<{
  readonly availableSats: number
  readonly requestedSats: number
}>()
export type InsufficientWithdrawalBalanceError = ReturnType<
  typeof createInsufficientWithdrawalBalanceError
>

const createWithdrawalQuoteFailedError = defineError("WithdrawalQuoteFailed")<{
  readonly message: string
}>()
export type WithdrawalQuoteFailedError = ReturnType<
  typeof createWithdrawalQuoteFailedError
>

const createWithdrawalRequestFailedError = defineError(
  "WithdrawalRequestFailed"
)<{
  readonly message: string
}>()
export type WithdrawalRequestFailedError = ReturnType<
  typeof createWithdrawalRequestFailedError
>

const createWithdrawalRecordingFailedError = defineError(
  "WithdrawalRecordingFailed"
)<{
  readonly message: string
}>()
export type WithdrawalRecordingFailedError = ReturnType<
  typeof createWithdrawalRecordingFailedError
>

export type ExecuteWithdrawalFailureError =
  | WithdrawalRequestFailedError
  | WithdrawalRecordingFailedError

export type QuoteWithdrawalError =
  | WithdrawalAccountNotFoundError
  | InvalidBitcoinAddressError
  | InsufficientWithdrawalBalanceError
  | WithdrawalQuoteFailedError

export type ExecuteWithdrawalError =
  | WithdrawalAccountNotFoundError
  | ExecuteWithdrawalFailureError

export const quoteWithdrawal =
  ({
    accountId,
    onchainAddress,
    amountSats,
  }: {
    readonly accountId: AccountId
    readonly onchainAddress: BitcoinAddress
    readonly amountSats?: PositiveInteger
  }): Task<WithdrawalQuote, QuoteWithdrawalError, EvoluDep & SparkWalletDep> =>
  async (run) => {
    if (!isValidBitcoinAddress(onchainAddress)) {
      return err(createInvalidBitcoinAddressError({ address: onchainAddress }))
    }

    const [sparkAccount] = await run.deps.evolu.loadQuery(
      activeSparkAccountByIdQuery(accountId)
    )
    if (!sparkAccount) {
      return err(createWithdrawalAccountNotFoundError({ accountId }))
    }

    try {
      await using wallet = await run.deps.sparkWallet.create(
        sparkAccount.secret
      )
      const balance = await wallet.getBalance()
      const withdrawAll = amountSats === undefined
      const quoteAmountSats = withdrawAll ? balance.availableSats : amountSats

      if (quoteAmountSats <= 0 || quoteAmountSats > balance.availableSats) {
        return err(
          createInsufficientWithdrawalBalanceError({
            availableSats: balance.availableSats,
            requestedSats: quoteAmountSats,
          })
        )
      }

      const feeQuote = await wallet.getWithdrawalFeeQuote({
        amountSats: quoteAmountSats,
        withdrawalAddress: onchainAddress,
      })
      if (!feeQuote) {
        return err(
          createWithdrawalQuoteFailedError({
            message: "No fee quote returned for this withdrawal",
          })
        )
      }

      return ok({
        availableSats: balance.availableSats,
        amountSats: quoteAmountSats,
        withdrawAll,
        feeQuote,
      })
    } catch (error) {
      return err(
        createWithdrawalQuoteFailedError({
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch the withdrawal fee quote",
        })
      )
    }
  }

export const executeWithdrawal =
  ({
    accountId,
    onchainAddress,
    quote: { amountSats, withdrawAll, availableSats, feeQuote },
    exitSpeed,
    deviceId,
  }: {
    readonly accountId: AccountId
    readonly onchainAddress: BitcoinAddress
    readonly quote: WithdrawalQuote
    readonly exitSpeed: SparkExitSpeed
    readonly deviceId?: DeviceId | null
  }): Task<
    {
      readonly accountTransactionId: AccountTransactionId
      readonly txid: string | null
      readonly status: SparkWithdrawalStatus
    },
    ExecuteWithdrawalError,
    EvoluDep & EvoluOwnerIdDep & DateDep & SparkWalletDep
  > =>
  async (run) => {
    const [sparkAccount] = await run.deps.evolu.loadQuery(
      activeSparkAccountByIdQuery(accountId)
    )
    if (!sparkAccount) {
      return err(createWithdrawalAccountNotFoundError({ accountId }))
    }

    const feeEstimate = feeQuote[exitSpeed]

    try {
      await using wallet = await run.deps.sparkWallet.create(
        sparkAccount.secret
      )
      const result = await wallet.withdraw({
        onchainAddress,
        exitSpeed,
        feeQuoteId: feeQuote.id,
        feeAmountSats: feeEstimate.totalFeeSats,
        amountSats: withdrawAll ? undefined : amountSats,
        deductFeeFromWithdrawalAmount: withdrawAll,
      })
      if (!result) {
        return err(
          createWithdrawalRequestFailedError({
            message: "The withdrawal request could not be completed",
          })
        )
      }

      // A second boundary, not a redundant one: past `wallet.withdraw` the
      // sats have left the wallet, so anything that fails from here on is
      // "the withdrawal happened and we failed to record it", which is not
      // what `WithdrawalRequestFailed` tells the operator. One `catch` cannot
      // separate the two without a flag, so the nesting stays.
      try {
        const totalDebitedSats = computeTotalDebitedSats({
          amountSats,
          withdrawAll,
          availableSats,
          feeSats: feeEstimate.totalFeeSats,
        })

        const accountTransactionId = await run.ok(
          createAccountTransaction({
            accountId,
            amount: Integer(-totalDebitedSats),
            currency: "BTC",
            occurredAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
            note: null,
            internalTransferGroupId: null,
            onchain: {
              onchainAddress,
              coopExitRequestId: NonEmptyStringSchema.decode(result.id),
              exitSpeed,
              feeSats: Integer(feeEstimate.totalFeeSats),
              txid:
                result.txid === null
                  ? null
                  : NonEmptyStringSchema.decode(result.txid),
            },
            source: {
              deviceId: deviceId ?? null,
              source: "manual",
            },
          })
        )

        return ok({
          accountTransactionId,
          txid: result.txid,
          status: result.status,
        })
      } catch (error) {
        return err(
          createWithdrawalRecordingFailedError({
            message:
              error instanceof Error
                ? error.message
                : "Failed to record the withdrawal transaction",
          })
        )
      }
    } catch (error) {
      return err(
        createWithdrawalRequestFailedError({
          message:
            error instanceof Error
              ? error.message
              : "Failed to execute the withdrawal",
        })
      )
    }
  }
