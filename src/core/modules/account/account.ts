import type { IndexesConfig } from "@evolu/common/local-first"

import { AccountId } from "@/core/modules/account/account-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import { SparkSecretSchema } from "@/core/modules/shared/key-derivation.ts"
import {
  AccountKindSchema,
  BankQrFormatSchema,
  FiatCurrencySchema,
  IbanSchema,
  type InferTable,
  NonEmptyString255Schema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

export const account = {
  id: AccountId,
  deviceId: DeviceId.nullable(),
  name: NonEmptyString255Schema,
  kind: AccountKindSchema,
} as const

export const accountIban = {
  id: AccountId,
  iban: IbanSchema,
  currency: FiatCurrencySchema,
  defaultQrFormat: BankQrFormatSchema,
} as const

export const accountSpark = {
  id: AccountId,
  secret: SparkSecretSchema,
} as const

/**
 * High-water mark for the Spark sync job's periodic full history rescan —
 * mirrors `fioPluginSyncPointer`. `lastSyncedAt` is the wall-clock time the
 * last successful rescan *started* (not the newest transfer's own
 * `createdTime`/`updatedTime`), the same way FIO's pointer is the sync
 * period's `to`, not a fact derived from the transactions found: an account
 * with no new transfers must still advance the pointer forward with the
 * clock, and a transfer's own timestamp says nothing about how safe skipping
 * it is next time.
 */
export const sparkAccountSyncPointer = {
  id: AccountId,
  lastSyncedAt: TimestampMsSchema,
} as const

export const accountCashRegister = {
  id: AccountId,
  currency: FiatCurrencySchema,
} as const

/**
 * The card terminal the SwitchioPay app is paired with. Owns nothing but a
 * currency: everything else about the terminal (merchant id, acquirer,
 * batches) lives in SwitchioPay itself, which this app only drives through
 * intents. See `src/core/native/switchio.ts`.
 */
export const accountCardSwitchio = {
  id: AccountId,
  currency: FiatCurrencySchema,
} as const

export const accountIndexes = ((create) => [
  create("account_kind").on("account").column("kind"),
]) satisfies IndexesConfig

export type AccountRow = InferTable<typeof account>
export type AccountIbanRow = InferTable<typeof accountIban>
export type AccountSparkRow = InferTable<typeof accountSpark>
export type SparkAccountSyncPointerRow = InferTable<
  typeof sparkAccountSyncPointer
>
export type AccountCashRegisterRow = InferTable<typeof accountCashRegister>
export type AccountCardSwitchioRow = InferTable<typeof accountCardSwitchio>
