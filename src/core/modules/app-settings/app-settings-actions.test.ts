import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { legalEntityQuery } from "@/core/modules/legal-entity/legal-entity-queries.ts"
import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { BankAccountInputIbanSchema } from "@/core/modules/shared/schema.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import { createEvoluTest } from "@/test/evolu.ts"
import { evoluTestDeps } from "@/test/evolu-deps.ts"
import {
  completeOnboarding,
  finishOnboarding,
  setEnabledHomeModes,
  updateTipSettings,
} from "./app-settings-actions.ts"
import { settingsQuery } from "./app-settings-queries.ts"
import {
  defaultPaymentMethod,
  defaultPaymentMethodOrder,
} from "./app-settings-utils.ts"

describe("tip settings actions", () => {
  test("persists each tip setting through Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(evoluTestDeps(evolu))

    await run.orThrow(
      completeOnboarding({
        fiatCurrency: "CZK",
        defaultPaymentMethod,
        paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
      })
    )
    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([
        expect.objectContaining({
          tipsEnabled: 1,
        }),
      ])
    await run.ok(
      updateTipSettings({
        enabled: false,
        percentages: [10, 20],
        fixedAmounts: [2500, 5000],
      })
    )

    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([
        expect.objectContaining({
          tipsEnabled: 0,
          presetTipPercentagesJson: "[10,20]",
          presetTipFixedAmountsJson: "[2500,5000]",
        }),
      ])
  })
})

describe("setEnabledHomeModes", () => {
  const onboard = completeOnboarding({
    fiatCurrency: "CZK",
    defaultPaymentMethod,
    paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
  })

  test("onboarding leaves the home modes unset, which means all of them", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(evoluTestDeps(evolu))

    await run.orThrow(onboard)

    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([expect.objectContaining({ enabledHomeModesJson: null })])
  })

  test("saves the enabled modes in their fixed order", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(evoluTestDeps(evolu))

    await run.orThrow(onboard)
    await run.orThrow(setEnabledHomeModes(["pos", "numpad", "pos"]))

    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([
        expect.objectContaining({ enabledHomeModesJson: '["numpad","pos"]' }),
      ])
  })

  test("refuses to disable every mode and keeps the stored set", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(evoluTestDeps(evolu))

    await run.orThrow(onboard)
    await run.orThrow(setEnabledHomeModes(["pos"]))
    const result = await run(setEnabledHomeModes([]))

    expect(result).toEqual({
      ok: false,
      error: { type: "NoHomeModeEnabled" },
    })
    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([expect.objectContaining({ enabledHomeModesJson: '["pos"]' })])
  })
})

const input = {
  country: "CZ",
  currency: "CZK",
  cash: true,
  btc: true,
  iban: BankAccountInputIbanSchema.parse("CZ6508000000192000145399"),
  defaultPaymentMethod,
  paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
} as const

describe("finishOnboarding", () => {
  test("writes the account's first settings", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      ...evoluTestDeps(evolu),
      masterKey: MasterKey("000102030405060708090a0b0c0d0e0f"),
    })

    await expect(run(finishOnboarding(input))).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    await expect.poll(() => evolu.loadQuery(settingsQuery)).toHaveLength(1)
  })

  test("writes no row on an onboarded account", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      ...evoluTestDeps(evolu),
      masterKey: MasterKey("000102030405060708090a0b0c0d0e0f"),
    })
    await run.orThrow(
      completeOnboarding({
        fiatCurrency: "EUR",
        defaultPaymentMethod,
        paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
      })
    )

    await expect(run(finishOnboarding(input))).resolves.toEqual({
      ok: false,
      error: { type: "AlreadyOnboarded" },
    })

    const [settings, legalEntity, taxRates, cash, spark, bank] =
      await Promise.all([
        evolu.loadQuery(settingsQuery),
        evolu.loadQuery(legalEntityQuery),
        evolu.loadQuery(taxRatesQuery),
        evolu.loadQuery(cashRegisterAccountQuery),
        evolu.loadQuery(sparkAccountQuery),
        evolu.loadQuery(fiatBankAccountQuery),
      ])
    expect(settings).toEqual([expect.objectContaining({ fiatCurrency: "EUR" })])
    expect([legalEntity, taxRates, cash, spark, bank]).toEqual([
      [],
      [],
      [],
      [],
      [],
    ])
  })
})
