import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createRowId } from "@/core/modules/shared/evolu-utils.ts"
import {
  NonNegativeInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import { createEetSale, deliverEetSale } from "./eet-actions.ts"
import {
  eetPaymentsToReportQuery,
  eetSalesToDeliverQuery,
  unconfirmedEetSalesQuery,
} from "./eet-queries.ts"
import {
  configureEet,
  createEetTestContext,
  createTestPayment,
  type EetTestContext,
  settleInCash,
} from "./eet-test-fixtures.ts"

const createSale = async (
  context: EetTestContext,
  {
    currency = "CZK",
    deviceId = context.deviceId,
  }: {
    readonly currency?: "CZK" | "EUR"
    readonly deviceId?: EetTestContext["deviceId"]
  } = {}
) => {
  await using run = testCreateRun(context.deps)
  const saleId = await run.ok(
    createEetSale({
      payment: {
        id: createRowId<"Payment">(),
        billId: null,
        amount: NonNegativeInteger(25_000),
        currency,
        method: "cashRegister",
        firstClaimedAt: TimestampMs(context.clock.date.now().getTime()),
      },
      deviceId,
    })
  )
  if (saleId === null) throw new Error("Expected a created sale.")
  return saleId
}

describe("eetPaymentsToReportQuery", () => {
  test("lists settled payments of this device since EET was enabled", async () => {
    await using context = await createEetTestContext()
    const before = await createTestPayment(context)
    await settleInCash(context, before)
    context.clock.advance(1_000)
    await configureEet(context)
    context.clock.advance(1_000)
    const settled = await createTestPayment(context, { tipAmount: 2_000 })
    await settleInCash(context, settled)
    const unsettled = await createTestPayment(context)
    const otherDevice = await createTestPayment(context, {
      deviceId: createRowId<"Device">(),
    })
    await settleInCash(context, otherDevice)

    const rows = await context.deps.evolu.loadQuery(
      eetPaymentsToReportQuery(context.deviceId)
    )

    expect(rows).toEqual([
      {
        id: settled,
        billId: null,
        amount: 25_000,
        currency: "CZK",
        enabledAt: context.clock.date.now().getTime() - 1_000,
        firstClaimedAt: context.clock.date.now().getTime(),
        method: "cashRegister",
      },
    ])
    expect(rows.map(({ id }) => id)).not.toContain(unsettled)
  })

  test("drops a payment once its sale record exists", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const paymentId = await createTestPayment(context)
    await settleInCash(context, paymentId)
    const [row] = await context.deps.evolu.loadQuery(
      eetPaymentsToReportQuery(context.deviceId)
    )
    if (row === undefined) throw new Error("Expected a payment to report.")
    await using run = testCreateRun(context.deps)

    await run.ok(createEetSale({ payment: row, deviceId: context.deviceId }))

    await expect
      .poll(() =>
        context.deps.evolu.loadQuery(eetPaymentsToReportQuery(context.deviceId))
      )
      .toEqual([])
  })
})

describe("eetSalesToDeliverQuery and unconfirmedEetSalesQuery", () => {
  test("separate what this device sends from what staff must see", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const pending = await createSale(context)
    const confirmed = await createSale(context)
    const rejected = await createSale(context)
    const unsupported = await createSale(context, { currency: "EUR" })
    const otherDevice = await createSale(context, {
      deviceId: createRowId<"Device">(),
    })
    await using run = testCreateRun(context.deps)
    await run.orThrow(deliverEetSale(confirmed))
    context.responder.answerNext({ type: "error", code: 4, message: "Refused" })
    await run.orThrow(deliverEetSale(rejected))

    await expect
      .poll(async () =>
        (
          await context.deps.evolu.loadQuery(
            eetSalesToDeliverQuery(context.deviceId)
          )
        ).map(({ id }) => id)
      )
      .toEqual([pending])
    const unconfirmed = await context.deps.evolu.loadQuery(
      unconfirmedEetSalesQuery
    )
    expect(new Set(unconfirmed.map(({ id }) => id))).toEqual(
      new Set([pending, rejected, unsupported, otherDevice])
    )
  })
})
