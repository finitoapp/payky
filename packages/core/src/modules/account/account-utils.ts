import { createIdFromString, type OwnerId } from "@evolu/common"
import type { SparkSecret } from "../shared/key-derivation.ts"
import type { FiatCurrency, Iban } from "../shared/schema.ts"
import type { AccountId } from "./account-types.ts"

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

export const createCardSwitchioAccountId = (
  currency: FiatCurrency
): AccountId =>
  createIdFromString<"Account">(`account:cardSwitchio:${currency}`)

/** Derived from Linky's app owner: one Cashu account per shared wallet. */
export const createCashuAccountId = (linkyAppOwnerId: OwnerId): AccountId =>
  createIdFromString<"Account">(`account:cashu:${linkyAppOwnerId}`)

/**
 * The fixed id the fiat bank account had before ids were derived from its
 * IBAN and currency. `fioPluginFixedIdMigration` matches the legacy plugin rows
 * that still point at it, and the Fio plugin is saved against it while no
 * fiat bank account exists yet — `saveFiatBankAccount` re-points the plugin
 * once one does, and `accountDerivedIdMigration` once a legacy one is migrated.
 */
export const legacyFiatBankAccountId = createIdFromString<"Account">(
  "payky-fiat-bank-account"
)

export const normalizeMnemonic = (value: string): string =>
  value.replaceAll(/\s+/gu, " ").trim()
