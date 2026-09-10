import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { createDateDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import {
  activateTaxRate,
  archiveTaxRate,
  createTaxRate,
  renameTaxRate,
  seedTaxRatesForCountry,
  setDefaultTaxRate,
} from "./tax-rate-actions.ts"
import { activeTaxRatesQuery, taxRatesQuery } from "./tax-rate-queries.ts"
import { TaxRatePercentage } from "./tax-rate-types.ts"

const createDeps = (evolu: EvoluDep["evolu"]) =>
  ({
    evolu,
    evoluOwnerId: evolu.appOwner.id,
  }) satisfies EvoluDep & EvoluOwnerIdDep

describe("tax rate actions", () => {
  test("creates tax rates with an increasing sortOrder and only one default", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    const standardId = await run.ok(
      createTaxRate({
        name: NonEmptyString255("Základní sazba"),
        rate: TaxRatePercentage(2100),
        isDefault: true,
      })
    )
    const reducedId = await run.ok(
      createTaxRate({
        name: NonEmptyString255("Snížená sazba"),
        rate: TaxRatePercentage(1200),
        isDefault: true,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(taxRatesQuery))
      .toMatchObject([
        { id: standardId, sortOrder: 0, isDefault: 0 },
        { id: reducedId, sortOrder: 1, isDefault: 1 },
      ])
  }, 15_000)

  test("counts an archived rate when appending the next one", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      ...createDeps(evolu),
      ...createDateDep(),
    })

    // Rates are archived rather than edited or deleted (see
    // `TaxRatePercentageSchema`), and an archived one keeps its `sortOrder`.
    // So the next rate has to be appended after it, not on top of it —
    // `taxRatesQuery` deliberately does not filter `deactivatedAt`, and
    // anything deriving the next `sortOrder` has to match that.
    const archivedId = await run.ok(
      createTaxRate({
        name: NonEmptyString255("Osvobozeno od DPH"),
        rate: TaxRatePercentage(0),
        isDefault: false,
      })
    )
    await run.ok(archiveTaxRate(archivedId))

    const appendedId = await run.ok(
      createTaxRate({
        name: NonEmptyString255("Základní sazba"),
        rate: TaxRatePercentage(2100),
        isDefault: false,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(taxRatesQuery))
      .toMatchObject([
        { id: archivedId, sortOrder: 0 },
        { id: appendedId, sortOrder: 1 },
      ])
  }, 15_000)

  test("renaming a tax rate never touches its rate", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    const id = await run.ok(
      createTaxRate({
        name: NonEmptyString255("Základní sazba"),
        rate: TaxRatePercentage(2100),
        isDefault: false,
      })
    )

    await run.ok(
      renameTaxRate({ id, name: NonEmptyString255("Standardní sazba") })
    )

    await expect
      .poll(() => evolu.loadQuery(taxRatesQuery))
      .toMatchObject([{ id, name: "Standardní sazba", rate: 2100 }])
  }, 15_000)

  test("setDefaultTaxRate keeps exactly one default", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    const firstId = await run.ok(
      createTaxRate({
        name: NonEmptyString255("A"),
        rate: TaxRatePercentage(2100),
        isDefault: true,
      })
    )
    const secondId = await run.ok(
      createTaxRate({
        name: NonEmptyString255("B"),
        rate: TaxRatePercentage(1200),
        isDefault: false,
      })
    )

    await run.ok(setDefaultTaxRate(secondId))

    await expect
      .poll(() => evolu.loadQuery(taxRatesQuery))
      .toMatchObject([
        { id: firstId, isDefault: 0 },
        { id: secondId, isDefault: 1 },
      ])
  }, 15_000)

  test("setDefaultTaxRate(null) clears the default so none is default", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    const id = await run.ok(
      createTaxRate({
        name: NonEmptyString255("A"),
        rate: TaxRatePercentage(2100),
        isDefault: true,
      })
    )

    await run.ok(setDefaultTaxRate(null))

    await expect
      .poll(() => evolu.loadQuery(taxRatesQuery))
      .toMatchObject([{ id, isDefault: 0 }])
  }, 15_000)

  test("archiving hides a tax rate from the active list but not from the full list", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      ...createDeps(evolu),
      ...createDateDep(),
    })

    const id = await run.ok(
      createTaxRate({
        name: NonEmptyString255("Osvobozeno od DPH"),
        rate: TaxRatePercentage(0),
        isDefault: false,
      })
    )

    await run.ok(archiveTaxRate(id))

    await expect.poll(() => evolu.loadQuery(activeTaxRatesQuery)).toEqual([])
    await expect
      .poll(() => evolu.loadQuery(taxRatesQuery))
      .toMatchObject([{ id }])

    await run.ok(activateTaxRate(id))

    await expect
      .poll(() => evolu.loadQuery(activeTaxRatesQuery))
      .toMatchObject([{ id }])
  }, 15_000)

  test("seeds the Czech preset rates", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    await run.ok(seedTaxRatesForCountry("CZ"))

    await expect
      .poll(() => evolu.loadQuery(taxRatesQuery))
      .toMatchObject([
        { name: "Základní sazba", rate: 2100, isDefault: 1 },
        { name: "Snížená sazba", rate: 1200, isDefault: 0 },
        { name: "Osvobozeno od DPH", rate: 0, isDefault: 0 },
      ])
  }, 15_000)

  test("seeding an unknown country creates no rates", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    await run.ok(seedTaxRatesForCountry(null))

    await expect.poll(() => evolu.loadQuery(taxRatesQuery)).toEqual([])
  }, 15_000)
})
