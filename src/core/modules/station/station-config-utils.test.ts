import { createIdFromString } from "@evolu/common"
import { describe, expect, test } from "vitest"

import {
  IbanSchema,
  NonEmptyString255,
  PositiveInteger,
  SparkIdentityPubkey,
} from "@/core/modules/shared/schema.ts"
import {
  buildStationConfig,
  isNewerStationConfig,
  serializeStationConfig,
} from "./station-config-utils.ts"

const station = {
  id: createIdFromString<"Station">("station-1"),
  name: NonEmptyString255("Bar"),
  number: PositiveInteger(3),
  cashEnabled: 1,
  ibanEnabled: 0,
  sparkEnabled: 1,
} as const

const settings = {
  fiatCurrency: "CZK",
  tipsEnabled: 1,
  presetTipPercentagesJson: "[10,15]",
  presetTipFixedAmountsJson: "[2000]",
  paymentMethodOrderJson: '["iban","spark","cashRegister","cardSwitchio"]',
  defaultPaymentMethod: "spark",
} as const

const employees = [
  { id: createIdFromString<"Employee">("b"), name: NonEmptyString255("Bea") },
  { id: createIdFromString<"Employee">("a"), name: NonEmptyString255("Adam") },
]

const accounts = {
  cash: { id: createIdFromString<"Account">("cash"), currency: "CZK" },
  iban: {
    id: createIdFromString<"Account">("iban"),
    iban: IbanSchema.parse("CZ6508000000192000145399"),
    currency: "CZK",
    name: NonEmptyString255("Bank"),
    defaultQrFormat: "spayd",
  },
  spark: {
    id: createIdFromString<"Account">("spark"),
    receiverIdentityPubkey: SparkIdentityPubkey(`02${"cd".repeat(32)}`),
  },
} as const

describe("buildStationConfig", () => {
  test("offers only the methods the station has on and the owner has an account for", () => {
    const config = buildStationConfig({
      station,
      settings,
      employees,
      ...accounts,
    })

    expect(config.cash).toEqual({
      accountId: accounts.cash.id,
      currency: "CZK",
    })
    expect(config.iban).toBeNull()
    expect(config.spark).toEqual({
      accountId: accounts.spark.id,
      receiverIdentityPubkey: accounts.spark.receiverIdentityPubkey,
    })
    expect(config.paymentMethodOrder).toEqual(["spark", "cashRegister"])
    expect(config.tips).toEqual({
      enabled: true,
      percentages: [10, 15],
      fixedAmounts: [2000],
    })
  })

  test("hashes the same inputs the same, whatever order employees come in", () => {
    const first = serializeStationConfig(
      buildStationConfig({ station, settings, employees, ...accounts })
    )
    const second = serializeStationConfig(
      buildStationConfig({
        station,
        settings,
        employees: employees.toReversed(),
        ...accounts,
      })
    )

    expect(second).toEqual(first)
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/u)
  })
})

describe("isNewerStationConfig", () => {
  test("takes a higher version, or the greater hash of the same version", () => {
    const current = { version: 2, hash: "b" }

    expect(isNewerStationConfig({ version: 1, hash: "z" }, undefined)).toBe(
      true
    )
    expect(isNewerStationConfig({ version: 3, hash: "a" }, current)).toBe(true)
    expect(isNewerStationConfig({ version: 2, hash: "c" }, current)).toBe(true)
    expect(isNewerStationConfig({ version: 2, hash: "b" }, current)).toBe(false)
    expect(isNewerStationConfig({ version: 2, hash: "a" }, current)).toBe(false)
    expect(isNewerStationConfig({ version: 1, hash: "z" }, current)).toBe(false)
  })
})
