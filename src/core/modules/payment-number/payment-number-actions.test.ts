import { createIdFromString, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { updatePaymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  DateStringSchema,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import { createNextPaymentNumber } from "./payment-number-actions.ts"
import { paymentNumbersByNewestQuery } from "./payment-number-queries.ts"

const createDeps = (evolu: EvoluDep["evolu"]) =>
  ({
    evolu,
    evoluOwnerId: evolu.appOwner.id,
  }) satisfies EvoluDep & EvoluOwnerIdDep

const dateString = DateStringSchema.decode
const paymentId = (value: string) => createIdFromString<"Payment">(value)

describe("payment number actions", () => {
  test("starts with serial number 1 when no previous number exists", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    const row = await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-1"),
        date: dateString("2026-06-05"),
      })
    )

    expect(row).toMatchObject({
      id: paymentId("payment-1"),
      serialNumber: 1,
      date: "2026-06-05",
    })

    await expect
      .poll(() => evolu.loadQuery(paymentNumbersByNewestQuery))
      .toMatchObject([row])
  }, 15_000)

  test("increments serial number within the same day", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-1"),
        date: dateString("2026-06-05"),
      })
    )
    const row = await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-2"),
        date: dateString("2026-06-05"),
      })
    )

    expect(row).toMatchObject({
      serialNumber: 2,
      date: "2026-06-05",
    })
  }, 15_000)

  test("resets serial number on a new day when day format is visible", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(6),
        yearFormat: "default",
        monthFormat: "hidden",
        dayFormat: "default",
        prefix: null,
      })
    )
    await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-1"),
        date: dateString("2026-06-05"),
      })
    )
    const row = await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-2"),
        date: dateString("2026-06-06"),
      })
    )

    expect(row).toMatchObject({
      serialNumber: 1,
      date: "2026-06-06",
    })
  }, 15_000)

  test("increments across days within the same month when day format is hidden and month format is visible", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(6),
        yearFormat: "default",
        monthFormat: "default",
        dayFormat: "hidden",
        prefix: null,
      })
    )
    await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-1"),
        date: dateString("2026-06-05"),
      })
    )
    const row = await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-2"),
        date: dateString("2026-06-06"),
      })
    )

    expect(row).toMatchObject({
      serialNumber: 2,
      date: "2026-06-06",
    })
  }, 15_000)

  test("resets serial number on a new month when month format is visible", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(6),
        yearFormat: "default",
        monthFormat: "default",
        dayFormat: "hidden",
        prefix: null,
      })
    )
    await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-1"),
        date: dateString("2026-06-30"),
      })
    )
    const row = await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-2"),
        date: dateString("2026-07-01"),
      })
    )

    expect(row).toMatchObject({
      serialNumber: 1,
      date: "2026-07-01",
    })
  }, 15_000)

  test("increments across months within the same year when day and month formats are hidden", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(6),
        yearFormat: "default",
        monthFormat: "hidden",
        dayFormat: "hidden",
        prefix: null,
      })
    )
    await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-1"),
        date: dateString("2026-06-30"),
      })
    )
    const row = await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-2"),
        date: dateString("2026-07-01"),
      })
    )

    expect(row).toMatchObject({
      serialNumber: 2,
      date: "2026-07-01",
    })
  }, 15_000)

  test("resets serial number on a new year when day and month formats are hidden", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(6),
        yearFormat: "short",
        monthFormat: "hidden",
        dayFormat: "hidden",
        prefix: null,
      })
    )
    await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-1"),
        date: dateString("2026-12-31"),
      })
    )
    const row = await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-2"),
        date: dateString("2027-01-01"),
      })
    )

    expect(row).toMatchObject({
      serialNumber: 1,
      date: "2027-01-01",
    })
  }, 15_000)

  test("uses newest date and serial number instead of newest created record", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)

    await run.orThrow(
      updatePaymentNumberSeries({
        serialNumberDigits: PositiveInteger(6),
        yearFormat: "default",
        monthFormat: "default",
        dayFormat: "hidden",
        prefix: null,
      })
    )
    await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-1"),
        date: dateString("2026-07-01"),
      })
    )
    await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-2"),
        date: dateString("2026-06-30"),
      })
    )
    const row = await run.orThrow(
      createNextPaymentNumber({
        id: paymentId("payment-3"),
        date: dateString("2026-07-02"),
      })
    )

    expect(row).toMatchObject({
      serialNumber: 2,
      date: "2026-07-02",
    })
  }, 15_000)
})
