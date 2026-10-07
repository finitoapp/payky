import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { z } from "zod"

import { createQuery } from "@/core/evolu/schema.ts"
import {
  cancelPayment,
  createPayment,
} from "@/core/modules/payment/payment-actions.ts"
import {
  NonNegativeInteger,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import { applyStationConfig } from "./station-config-actions.ts"
import {
  markStationReportsAcked,
  syncStationOutbox,
} from "./station-outbox-actions.ts"
import { StationPaymentSnapshotJson } from "./station-protocol.ts"
import { unackedStationOutboxQuery } from "./station-queries.ts"
import {
  computeStationReportHash,
  genesisReportHash,
} from "./station-report-utils.ts"
import {
  createStationTestContext,
  createTestStationConfigMessage,
  type StationTestContext,
} from "./station-test-fixtures.ts"

const outboxQuery = createQuery((db) =>
  db
    .selectFrom("stationOutbox")
    .select(["seq", "prevHash", "hash", "paymentId", "payloadJson", "ackedAt"])
    .orderBy("seq")
)

const setUpStation = async (context: StationTestContext) => {
  await using run = testCreateRun(context.stationDeps)
  await run.orThrow(applyStationConfig(createTestStationConfigMessage(context)))
  return await run.orThrow(
    createPayment({
      deviceId: null,
      billId: null,
      tableId: null,
      amount: NonNegativeInteger(5_000),
      currency: "CZK",
      tipAmount: NonNegativeInteger(500),
      canceledAt: null,
      expiresAt: null,
      stationId: context.stationId,
      employeeId: context.employeeId,
      cashRegister: { accountId: context.cashAccountId },
    })
  )
}

describe("syncStationOutbox", () => {
  test("appends a chained report only when a payment changed", async () => {
    await using context = await createStationTestContext()
    const paymentId = await setUpStation(context)
    await using run = testCreateRun(context.stationDeps)
    const { evolu } = context.stationDeps

    expect(await run(syncStationOutbox())).toEqual({ ok: true, value: 1 })
    expect(await run(syncStationOutbox())).toEqual({ ok: true, value: 0 })

    await run.orThrow(cancelPayment(paymentId))
    expect(await run(syncStationOutbox())).toEqual({ ok: true, value: 1 })

    const [first, second] = await evolu.loadQuery(outboxQuery)
    expect(first).toMatchObject({ seq: 1, prevHash: genesisReportHash })
    expect(second).toMatchObject({ seq: 2, prevHash: first?.hash })
    for (const report of [first, second]) {
      if (report === undefined) throw new Error("A report is missing.")
      expect(
        computeStationReportHash({
          seq: report.seq ?? 0,
          prevHash: report.prevHash ?? genesisReportHash,
          payload: report.payloadJson ?? "",
        })
      ).toBe(report.hash)
    }
  })

  test("tags every report with the station and the employee who took it", async () => {
    await using context = await createStationTestContext()
    const paymentId = await setUpStation(context)
    await using run = testCreateRun(context.stationDeps)
    await run(syncStationOutbox())

    const [report] = await context.stationDeps.evolu.loadQuery(outboxQuery)
    expect(
      z.decode(StationPaymentSnapshotJson, report?.payloadJson ?? "")
    ).toMatchObject({
      paymentId,
      stationId: context.stationId,
      employeeId: context.employeeId,
      amount: 5_000,
      tipAmount: 500,
      cash: { accountId: context.cashAccountId, receivedAmount: null },
      settlements: [],
    })
  })
})

describe("markStationReportsAcked", () => {
  test("ignores an ack for a report it did not send", async () => {
    await using context = await createStationTestContext()
    await setUpStation(context)
    await using run = testCreateRun(context.stationDeps)
    const { evolu } = context.stationDeps
    await run(syncStationOutbox())
    const [report] = await evolu.loadQuery(unackedStationOutboxQuery)
    if (report === undefined) throw new Error("No report was appended.")

    expect(
      await run(
        markStationReportsAcked([
          {
            seq: PositiveInteger(1),
            hash: computeStationReportHash({
              seq: 1,
              prevHash: genesisReportHash,
              payload: "{}",
            }),
          },
        ])
      )
    ).toEqual({ ok: true, value: 0 })
    expect(await evolu.loadQuery(unackedStationOutboxQuery)).toHaveLength(1)

    expect(
      await run(
        markStationReportsAcked([{ seq: report.seq, hash: report.hash }])
      )
    ).toEqual({ ok: true, value: 1 })
    expect(await evolu.loadQuery(unackedStationOutboxQuery)).toEqual([])
  })
})
