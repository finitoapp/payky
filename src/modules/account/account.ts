import { AccountId } from "@/modules/account/account-types.ts"
import { DeviceId } from "@/modules/device/device-types.ts"
import {
  AccountKindSchema,
  FiatCurrencySchema,
  IbanSchema,
  type InferTable,
  NonEmptyString255Schema,
} from "@/modules/shared/schema.ts"

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

export type AccountRow = InferTable<typeof account>
export type AccountIbanRow = InferTable<typeof accountIban>
export type AccountSparkRow = InferTable<typeof accountSpark>
export type AccountCashRegisterRow = InferTable<typeof accountCashRegister>
