import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { completeOnboarding } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  defaultPaymentMethod,
  defaultPaymentMethodOrder,
} from "@/core/modules/app-settings/app-settings-utils.ts"
import { legalEntityQuery } from "@/core/modules/legal-entity/legal-entity-queries.ts"
import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { BankAccountInputIbanSchema } from "@/core/modules/shared/schema.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import { finishOnboarding } from "@/features/onboarding/finish-onboarding.ts"

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
      evolu,
      evoluOwnerId: evolu.appOwner.id,
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
      evolu,
      evoluOwnerId: evolu.appOwner.id,
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
