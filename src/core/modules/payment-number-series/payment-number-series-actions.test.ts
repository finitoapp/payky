import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyString255,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import {
  getPaymentNumberSeries,
  updatePaymentNumberSeries,
} from "./payment-number-series-actions.ts"
import { paymentNumberSeriesQuery } from "./payment-number-series-queries.ts"
import { paymentNumberSeriesId } from "./payment-number-series-utils.ts"

const createDeps = (evolu: EvoluDep["evolu"]) =>
  ({
    evolu,
    evoluOwnerId: evolu.appOwner.id,
  }) satisfies EvoluDep & EvoluOwnerIdDep

describe("payment number series actions", () => {
  test("creates and returns the deterministic default series", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    const series = await run.orThrow(getPaymentNumberSeries())

    expect(series).toEqual({
      id: paymentNumberSeriesId,
      serialNumberDigits: PositiveInteger(6),
      yearFormat: "default",
      monthFormat: "default",
      dayFormat: "default",
      prefix: null,
    })

    await expect
      .poll(() => evolu.loadQuery(paymentNumberSeriesQuery))
      .toMatchObject([series])
  }, 15_000)

  test("returns the existing deterministic series without overwriting it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(4),
        yearFormat: "short",
        monthFormat: "hidden",
        dayFormat: "hidden",
        prefix: NonEmptyString255("INV"),
      })
    )

    const series = await run.orThrow(getPaymentNumberSeries())

    expect(series).toMatchObject({
      id: paymentNumberSeriesId,
      serialNumberDigits: PositiveInteger(4),
      yearFormat: "short",
      monthFormat: "hidden",
      dayFormat: "hidden",
      prefix: NonEmptyString255("INV"),
    })
  }, 15_000)

  test("updates the deterministic series and preserves omitted values", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    const firstUpdateId = await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(8),
        yearFormat: "default",
        monthFormat: "default",
        dayFormat: "hidden",
        prefix: NonEmptyString255("PAY"),
      })
    )

    expect(firstUpdateId).toBe(paymentNumberSeriesId)

    const secondUpdateId = await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(10),
        yearFormat: undefined,
        monthFormat: "hidden",
        dayFormat: undefined,
        prefix: undefined,
      })
    )

    expect(secondUpdateId).toBe(paymentNumberSeriesId)

    await expect
      .poll(() => evolu.loadQuery(paymentNumberSeriesQuery))
      .toMatchObject([
        {
          id: paymentNumberSeriesId,
          serialNumberDigits: PositiveInteger(10),
          yearFormat: "default",
          monthFormat: "hidden",
          dayFormat: "hidden",
          prefix: NonEmptyString255("PAY"),
        },
      ])
  }, 15_000)
})
