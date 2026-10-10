import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createEvoluTest } from "@/test/evolu.ts"
import { evoluTestDeps } from "@/test/evolu-deps.ts"
import { setLegalEntity } from "./legal-entity-actions.ts"
import { legalEntityQuery } from "./legal-entity-queries.ts"

describe("legal entity actions", () => {
  test("persists country and VAT-payer status", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(evoluTestDeps(evolu))

    await run.ok(setLegalEntity({ country: "CZ", vatPayer: true }))

    await expect
      .poll(() => evolu.loadQuery(legalEntityQuery))
      .toMatchObject([{ country: "CZ", vatPayer: 1 }])

    await run.ok(setLegalEntity({ country: "CZ", vatPayer: false }))

    await expect
      .poll(() => evolu.loadQuery(legalEntityQuery))
      .toMatchObject([{ country: "CZ", vatPayer: 0 }])
  }, 15_000)

  test("supports a never-configured null VAT-payer status", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(evoluTestDeps(evolu))

    await run.ok(setLegalEntity({ country: null, vatPayer: null }))

    await expect
      .poll(() => evolu.loadQuery(legalEntityQuery))
      .toMatchObject([{ country: null, vatPayer: null }])
  }, 15_000)
})
