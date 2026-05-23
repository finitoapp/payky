import type { IndexesConfig } from "@evolu/common/local-first"

import { AccountId } from "@/core/modules/account/account-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  AccountKindSchema,
  FiatCurrencySchema,
  IbanSchema,
  type InferTable,
  NonEmptyString255Schema,
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
} as const

export const accountSpark = {
  id: AccountId,
  mnemonic: NonEmptyString255Schema,
} as const

export const accountCashRegister = {
  id: AccountId,
  currency: FiatCurrencySchema,
} as const

export const accountIndexes = ((create) => [
  create("account_kind").on("account").column("kind"),
]) satisfies IndexesConfig

export type AccountRow = InferTable<typeof account>
export type AccountIbanRow = InferTable<typeof accountIban>
export type AccountSparkRow = InferTable<typeof accountSpark>
export type AccountCashRegisterRow = InferTable<typeof accountCashRegister>
