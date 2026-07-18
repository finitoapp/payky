import { createIdFromString } from "@evolu/common"

export const fiatBankAccountId = createIdFromString<"Account">(
  "payky-fiat-bank-account"
)

export const sparkAccountId = createIdFromString<"Account">(
  "payky-spark-account"
)

export const cashRegisterAccountId = createIdFromString<"Account">(
  "payky-cash-register-account"
)

export const normalizeMnemonic = (value: string): string =>
  value.replaceAll(/\s+/gu, " ").trim()
