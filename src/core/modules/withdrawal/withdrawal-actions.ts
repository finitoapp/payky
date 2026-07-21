import { err, ok, type Task } from "@evolu/common"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  Integer,
  NonEmptyStringSchema,
  type PositiveInteger,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import type {
  SparkExitSpeed,
  SparkWalletDep,
  SparkWithdrawalFeeQuote,
} from "@/core/spark/spark-wallet.ts"
import {
  createInsufficientWithdrawalBalanceError,
  createInvalidBitcoinAddressError,
  createWithdrawalAccountNotFoundError,
  createWithdrawalQuoteFailedError,
  createWithdrawalRecordingFailedError,
  createWithdrawalRequestFailedError,
  type ExecuteWithdrawalError,
  type QuoteWithdrawalError,
} from "./withdrawal-types.ts"
import {
  computeTotalDebitedSats,
  isValidBitcoinAddress,
} from "./withdrawal-utils.ts"

export interface WithdrawalQuote {
  readonly availableSats: number
  readonly amountSats: number
  readonly withdrawAll: boolean
  readonly feeQuote: SparkWithdrawalFeeQuote
}

const findSparkAccount = async (
  run: { readonly deps: EvoluDep & SparkWalletDep },
  accountId: AccountId
) => {
  const sparkAccounts = await run.deps.evolu.loadQuery(activeSparkAccountsQuery)
  return sparkAccounts.find((account) => account.id === accountId)
}

export const quoteWithdrawal =
  ({
    accountId,
    onchainAddress,
    amountSats,
  }: {
    readonly accountId: AccountId
    readonly onchainAddress: string
    readonly amountSats?: PositiveInteger
  }): Task<WithdrawalQuote, QuoteWithdrawalError, EvoluDep & SparkWalletDep> =>
  async (run) => {
    if (!isValidBitcoinAddress(onchainAddress)) {
      return err(createInvalidBitcoinAddressError({ address: onchainAddress }))
    }

    const sparkAccount = await findSparkAccount(run, accountId)
    if (!sparkAccount) {
      return err(createWithdrawalAccountNotFoundError({ accountId }))
    }

    try {
      await using wallet = await run.deps.sparkWallet.create(
        sparkAccount.mnemonic
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
    amountSats,
    withdrawAll,
    availableSats,
    exitSpeed,
    feeQuote,
    deviceId,
  }: {
    readonly accountId: AccountId
    readonly onchainAddress: string
    readonly amountSats: PositiveInteger
    readonly withdrawAll: boolean
    readonly availableSats: number
    readonly exitSpeed: SparkExitSpeed
    readonly feeQuote: SparkWithdrawalFeeQuote
    readonly deviceId?: DeviceId | null
  }): Task<
    {
      readonly accountTransactionId: AccountTransactionId
      readonly txid: string | null
      readonly status: string
    },
    ExecuteWithdrawalError,
    EvoluDep & EvoluOwnerIdDep & DateDep & SparkWalletDep
  > =>
  async (run) => {
    const sparkAccount = await findSparkAccount(run, accountId)
    if (!sparkAccount) {
      return err(createWithdrawalAccountNotFoundError({ accountId }))
    }

    const feeEstimate = feeQuote[exitSpeed]

    try {
      await using wallet = await run.deps.sparkWallet.create(
        sparkAccount.mnemonic
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

      try {
        const totalDebitedSats = computeTotalDebitedSats({
          amountSats,
          withdrawAll,
          availableSats,
          feeSats: feeEstimate.totalFeeSats,
        })

        const accountTransactionResult = await run(
          createAccountTransaction({
            accountId,
            amount: Integer(-totalDebitedSats),
            currency: "BTC",
            occurredAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
            note: null,
            internalTransferGroupId: null,
            onchain: {
              onchainAddress: NonEmptyStringSchema.decode(onchainAddress),
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
        if (!accountTransactionResult.ok) {
          return err(
            createWithdrawalRecordingFailedError({
              message: "Failed to record the withdrawal transaction",
            })
          )
        }

        return ok({
          accountTransactionId: accountTransactionResult.value,
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
