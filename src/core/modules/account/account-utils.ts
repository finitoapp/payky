import { createIdFromString } from "@evolu/common"

import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import type { FiatCurrency, Iban } from "@/core/modules/shared/schema.ts"

/**
 * An account's id is derived from the detail values that identify it, so the
 * same bank account, wallet or till always lands on the same row — two
 * devices configuring it offline write one row instead of racing on a shared
 * one. Those values are therefore immutable: changing one means a different
 * account (a new row), never an edit. Everything else on the account and its
 * detail row stays editable.
 */
export const createIbanAccountId = ({
  iban,
  currency,
}: {
  readonly iban: Iban
  readonly currency: FiatCurrency
}): AccountId =>
  createIdFromString<"Account">(`account:iban:${iban}:${currency}`)

export const createSparkAccountId = (secret: SparkSecret): AccountId =>
  createIdFromString<"Account">(`account:spark:${secret}`)

export const createCashRegisterAccountId = (
  currency: FiatCurrency
): AccountId =>
  createIdFromString<"Account">(`account:cashRegister:${currency}`)

/**
 * The fixed id the fiat bank account had before ids were derived from its
 * IBAN and currency. `migrateLegacyFioPlugins` matches the legacy plugin rows
 * that still point at it, and the Fio plugin is saved against it while no
 * fiat bank account exists yet — `saveFiatBankAccount` re-points the plugin
 * once one does, and `accountDerivedIdMigration` once a legacy one is migrated.
 */
export const legacyFiatBankAccountId = createIdFromString<"Account">(
  "payky-fiat-bank-account"
)

export const normalizeMnemonic = (value: string): string =>
  value.replaceAll(/\s+/gu, " ").trim()
