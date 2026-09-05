import { ok, sqliteFalse, sqliteTrue, type Task } from "@evolu/common"
import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyString255,
  type NonEmptyString255 as NonEmptyString255Type,
  NonNegativeInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import {
  getNextSortOrder,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { taxRatesQuery } from "./tax-rate-queries.ts"
import { getTaxRateSeedForCountry } from "./tax-rate-seed-data.ts"
import type { TaxRateId, TaxRatePercentage } from "./tax-rate-types.ts"

export const createTaxRate =
  (input: {
    readonly name: NonEmptyString255Type
    readonly rate: TaxRatePercentage
    readonly isDefault: boolean
  }): Task<TaxRateId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const existing = await run.deps.evolu.loadQuery(taxRatesQuery)
    const nextSortOrder = getNextSortOrder(existing)
    const mutationOptions = { ownerId: evoluOwnerId }

    const { id } = await runMutationWithCompletion((options) => {
      const combinedOptions = { ...options, ...mutationOptions }

      if (input.isDefault) {
        for (const rate of existing) {
          if (rate.isDefault === sqliteTrue) {
            run.deps.evolu.update(
              "taxRate",
              { id: rate.id, isDefault: sqliteFalse },
              combinedOptions
            )
          }
        }
      }

      return run.deps.evolu.insert(
        "taxRate",
        removeUndefinedValues({
          name: input.name,
          rate: input.rate,
          sortOrder: nextSortOrder,
          isDefault: input.isDefault ? sqliteTrue : sqliteFalse,
          deactivatedAt: null,
        }),
        combinedOptions
      )
    })

    return ok(id)
  }

export const renameTaxRate =
  (input: {
    readonly id: TaxRateId
    readonly name: NonEmptyString255Type
  }): Task<TaxRateId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "taxRate",
        { id: input.id, name: input.name },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(input.id)
  }

/**
 * Sets exactly one tax rate as default, unsetting any other row's
 * `isDefault` in the same batch. Pass `null` to clear the default so no tax
 * rate is default.
 */
export const setDefaultTaxRate =
  (
    id: TaxRateId | null
  ): Task<TaxRateId | null, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const existing = await run.deps.evolu.loadQuery(taxRatesQuery)

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      for (const rate of existing) {
        const shouldBeDefault = rate.id === id
        if ((rate.isDefault === sqliteTrue) === shouldBeDefault) continue

        run.deps.evolu.update(
          "taxRate",
          {
            id: rate.id,
            isDefault: shouldBeDefault ? sqliteTrue : sqliteFalse,
          },
          mutationOptions
        )
      }
    })

    return ok(id)
  }

export const archiveTaxRate =
  (
    id: TaxRateId
  ): Task<TaxRateId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "taxRate",
        {
          id,
          deactivatedAt: TimestampMs(run.deps.date.now().getTime()),
          isDefault: sqliteFalse,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(id)
  }

export const activateTaxRate =
  (id: TaxRateId): Task<TaxRateId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "taxRate",
        { id, deactivatedAt: null },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(id)
  }

/**
 * Seeds the country-appropriate preset tax rates. Called once, from
 * onboarding, regardless of the tenant's VAT-payer status — rates exist
 * independently of whether any catalog item currently uses them.
 */
export const seedTaxRatesForCountry =
  (
    country: CountryCode | null
  ): Task<ReadonlyArray<TaxRateId>, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const seeds = getTaxRateSeedForCountry(country)
    if (seeds.length === 0) return ok([])

    const ids = await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      return seeds.map(
        (seed, index) =>
          run.deps.evolu.insert(
            "taxRate",
            removeUndefinedValues({
              name: NonEmptyString255(seed.name),
              rate: seed.rate,
              sortOrder: NonNegativeInteger(index),
              isDefault: seed.isDefault ? sqliteTrue : sqliteFalse,
              deactivatedAt: null,
            }),
            mutationOptions
          ).id
      )
    })

    return ok(ids)
  }
