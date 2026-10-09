import type { IndexesConfig } from "@evolu/common/local-first"

import { AccountId } from "@/core/modules/account/account-types.ts"
import { AccountTransactionOnchainExitSpeedSchema } from "@/core/modules/account-transaction/account-transaction.ts"
import { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  BitcoinAddressSchema,
  type InferTable,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  WithdrawalFailureReasonSchema,
  WithdrawalId,
} from "./withdraw-types.ts"

/**
 * One withdrawal from a Spark wallet, written before any money leaves
 * (withdraw/0001). Its kind is whichever detail table holds its row; its state
 * is derived, not stored (withdraw/0003): done once the account transaction
 * `accountTransactionId` names exists, failed once `failedAt` is set, in
 * progress otherwise.
 */
export const withdrawal = {
  id: WithdrawalId,
  accountId: AccountId,
  deviceId: DeviceId.nullable(),
  /** What the recipient gets, never the fee. */
  amountSats: PositiveIntegerSchema,
  /** Known before sending: the movement the action or the sync job will write. */
  accountTransactionId: AccountTransactionId,
  failedAt: TimestampMsSchema.nullable(),
  /** Set together with `failedAt`. */
  failureReason: WithdrawalFailureReasonSchema.nullable(),
} as const

export const withdrawalOnchain = {
  id: WithdrawalId,
  onchainAddress: BitcoinAddressSchema,
  exitSpeed: AccountTransactionOnchainExitSpeedSchema,
  /** The quoted fee, for the movement an operator's "the money left" writes. */
  feeSats: NonNegativeIntegerSchema,
} as const

export const withdrawalLightning = {
  id: WithdrawalId,
  /** `null` when paying an invoice directly. */
  lightningAddress: NonEmptyStringSchema.nullable(),
  /** The invoice paid, for display only. */
  lnInvoice: NonEmptyStringSchema,
  /** The UUID handed to the SDK: the Spark transfer's id and idempotency key. */
  sparkTransferId: NonEmptyStringSchema,
  maxFeeSats: NonNegativeIntegerSchema,
} as const

export const withdrawalIndexes = ((create) => [
  create("withdrawal_accountId_createdAt")
    .on("withdrawal")
    .columns(["accountId", "createdAt"]),
  create("withdrawal_accountTransactionId")
    .on("withdrawal")
    .column("accountTransactionId"),
]) satisfies IndexesConfig

export type WithdrawalRow = InferTable<typeof withdrawal>
export type WithdrawalOnchainRow = InferTable<typeof withdrawalOnchain>
export type WithdrawalLightningRow = InferTable<typeof withdrawalLightning>
