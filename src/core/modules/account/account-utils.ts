import { createIdFromString } from "@evolu/common"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"

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

export const createSparkAccountMnemonic = (): NonEmptyString255 =>
  NonEmptyString255(generateMnemonic(wordlist, 128))
