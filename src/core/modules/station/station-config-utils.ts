import { createIdFromString, sqliteTrue } from "@evolu/common"

import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  parseTipFixedAmounts,
  parseTipPercentages,
} from "@/core/modules/app-settings/app-settings-tips.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import { getPaymentMethodOrder } from "@/core/modules/app-settings/app-settings-utils.ts"
import type { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import type {
  BankQrFormat,
  FiatCurrency,
  Iban,
  NonEmptyString255,
  PositiveInteger,
  Sha256Hex,
  SparkIdentityPubkey,
} from "@/core/modules/shared/schema.ts"
import type { StationConfig, StationPaymentMethod } from "./station-protocol.ts"
import { sha256Hex } from "./station-report-utils.ts"
import type { StationId } from "./station-types.ts"

export const stationConfigRowId = createIdFromString<"StationConfig">(
  "payky-station-config"
)

export const stationSessionRowId = createIdFromString<"StationSession">(
  "payky-station-session"
)

/** Station numbers prefix a 6-digit specific symbol, which holds 10 digits. */
export const maxStationNumber = 9999

/**
 * The config a station runs on, from the owner's own settings, accounts and
 * employees (station/0008). Keys and employees are in a fixed order, so the
 * same inputs always hash the same.
 */
export const buildStationConfig = ({
  station,
  settings,
  employees,
  cash,
  iban,
  spark,
}: {
  readonly station: {
    readonly id: StationId
    readonly name: NonEmptyString255
    readonly number: PositiveInteger
    readonly cashEnabled: 0 | 1
    readonly ibanEnabled: 0 | 1
    readonly sparkEnabled: 0 | 1
  }
  readonly settings: {
    readonly fiatCurrency: FiatCurrency
    readonly tipsEnabled: 0 | 1
    readonly presetTipPercentagesJson: string
    readonly presetTipFixedAmountsJson: string
    readonly paymentMethodOrderJson: string
    readonly defaultPaymentMethod: DefaultPaymentMethod
  }
  readonly employees: ReadonlyArray<{
    readonly id: EmployeeId
    readonly name: NonEmptyString255
  }>
  readonly cash: {
    readonly id: AccountId
    readonly currency: FiatCurrency
  } | null
  readonly iban: {
    readonly id: AccountId
    readonly iban: Iban
    readonly currency: FiatCurrency
    readonly name: NonEmptyString255
    readonly defaultQrFormat: BankQrFormat
  } | null
  readonly spark: {
    readonly id: AccountId
    readonly receiverIdentityPubkey: SparkIdentityPubkey
  } | null
}): StationConfig => {
  const cashConfig =
    station.cashEnabled === sqliteTrue && cash !== null
      ? { accountId: cash.id, currency: cash.currency }
      : null
  const ibanConfig =
    station.ibanEnabled === sqliteTrue && iban !== null
      ? {
          accountId: iban.id,
          iban: iban.iban,
          currency: iban.currency,
          name: iban.name,
          defaultQrFormat: iban.defaultQrFormat,
        }
      : null
  const sparkConfig =
    station.sparkEnabled === sqliteTrue && spark !== null
      ? {
          accountId: spark.id,
          receiverIdentityPubkey: spark.receiverIdentityPubkey,
        }
      : null
  const offered = {
    cashRegister: cashConfig !== null,
    iban: ibanConfig !== null,
    spark: sparkConfig !== null,
    cardSwitchio: false,
  } satisfies Record<DefaultPaymentMethod, boolean>

  return {
    stationId: station.id,
    name: station.name,
    number: station.number,
    currency: settings.fiatCurrency,
    employees: employees
      .map((employee) => ({ id: employee.id, name: employee.name }))
      .toSorted((a, b) => a.id.localeCompare(b.id)),
    tips: {
      enabled: settings.tipsEnabled === sqliteTrue,
      percentages: [...parseTipPercentages(settings.presetTipPercentagesJson)],
      fixedAmounts: [
        ...parseTipFixedAmounts(settings.presetTipFixedAmountsJson),
      ],
    },
    paymentMethodOrder: getPaymentMethodOrder(settings).filter(
      (method): method is StationPaymentMethod => offered[method]
    ),
    cash: cashConfig,
    iban: ibanConfig,
    spark: sparkConfig,
  }
}

/** The config as sent: its JSON and the hash that names it. */
export const serializeStationConfig = (
  config: StationConfig
): { readonly configJson: string; readonly hash: Sha256Hex } => {
  const configJson = JSON.stringify(config)
  return { configJson, hash: sha256Hex(configJson) }
}

/**
 * Whether a received config replaces the applied one: a higher version, or
 * the same version with a greater hash, so two owner devices that bumped to
 * the same version still agree on one (station/0008).
 */
export const isNewerStationConfig = (
  incoming: { readonly version: number; readonly hash: string },
  current: { readonly version: number; readonly hash: string } | undefined
): boolean =>
  current === undefined ||
  incoming.version > current.version ||
  (incoming.version === current.version && incoming.hash > current.hash)
