import { ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep, MasterKeyDep } from "@/core/deps.ts"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import {
  type AlreadyOnboardedError,
  completeOnboarding,
  requireNotOnboarded,
} from "@/core/modules/app-settings/app-settings-actions.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import { setLegalEntity } from "@/core/modules/legal-entity/legal-entity-actions.ts"
import { legalEntityQuery } from "@/core/modules/legal-entity/legal-entity-queries.ts"
import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import type { FiatCurrency, Iban } from "@/core/modules/shared/schema.ts"
import { seedTaxRatesForCountry } from "@/core/modules/tax-rate/tax-rate-actions.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"

/**
 * Writes everything the onboarding wizard collected. Refuses an onboarded
 * account before the first write (account/0005): the bank account below is
 * a last-write-wins singleton, so a refusal in `completeOnboarding` alone
 * would come after the IBAN was already overwritten.
 */
export const finishOnboarding =
  (input: {
    readonly country: CountryCode | null
    readonly currency: FiatCurrency
    readonly cash: boolean
    readonly btc: boolean
    readonly iban: Iban | null
    readonly defaultPaymentMethod: DefaultPaymentMethod
    readonly paymentMethodOrderJson: string
  }): Task<
    void,
    AlreadyOnboardedError,
    EvoluDep & EvoluOwnerIdDep & MasterKeyDep
  > =>
  async (run) => {
    const notOnboarded = await run(requireNotOnboarded())
    if (!notOnboarded.ok) return notOnboarded

    // A restored account can still reach onboarding with data on a relay
    // this device has not synced yet — `_terminal.tsx` gives up waiting for
    // an owner the shared worker never reports, and the restore page lets the
    // merchant set up a phrase whose relays were unreachable. Guard these two
    // against that data arriving later: unlike the singleton account upserts
    // below, `setLegalEntity` would overwrite an already-synced row via
    // last-write-wins, and `seedTaxRatesForCountry` has no upsert semantics
    // at all — it would insert a duplicate set of rates.
    const [existingLegalEntity, existingTaxRates] = await Promise.all([
      run.deps.evolu.loadQuery(legalEntityQuery),
      run.deps.evolu.loadQuery(taxRatesQuery),
    ])

    if (existingLegalEntity.length === 0) {
      await run.ok(setLegalEntity({ country: input.country, vatPayer: false }))
    }
    if (existingTaxRates.length === 0) {
      await run.ok(seedTaxRatesForCountry(input.country))
    }
    await run.ok(
      saveCashRegisterAccount({ enabled: input.cash, currency: input.currency })
    )
    await run.ok(saveSparkAccount({ enabled: input.btc }))
    await run.ok(
      saveFiatBankAccount({
        enabled: input.iban !== null,
        iban: input.iban ?? undefined,
        currency: input.currency,
      })
    )
    const completed = await run(
      completeOnboarding({
        fiatCurrency: input.currency,
        defaultPaymentMethod: input.defaultPaymentMethod,
        paymentMethodOrderJson: input.paymentMethodOrderJson,
      })
    )
    if (!completed.ok) return completed
    return ok()
  }
