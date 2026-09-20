import { createIdFromString } from "@evolu/common"

import { CashuMintUrl } from "@/core/modules/shared/schema.ts"

export const fiatBankAccountId = createIdFromString<"Account">(
  "payky-fiat-bank-account"
)

export const sparkAccountId = createIdFromString<"Account">(
  "payky-spark-account"
)

export const cashuAccountId = createIdFromString<"Account">(
  "payky-cashu-account"
)

/**
 * Linky's main mint. Sharing it is what makes "the same phrase, the same
 * balance" true in practice: a restore scans the mints it is given, and this
 * is where Linky-created ecash lives unless the user changed mints there.
 */
export const defaultCashuMintUrl = CashuMintUrl("https://cashu.cz")

export const cashRegisterAccountId = createIdFromString<"Account">(
  "payky-cash-register-account"
)

export const normalizeMnemonic = (value: string): string =>
  value.replaceAll(/\s+/gu, " ").trim()
