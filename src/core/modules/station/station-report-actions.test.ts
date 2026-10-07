import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { z } from "zod"

import { createQuery } from "@/core/evolu/schema.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import {
  paymentByIdQuery,
  paymentClaimsQuery,
} from "@/core/modules/payment/payment-queries.ts"
import { createRowId } from "@/core/modules/shared/evolu-utils.ts"
import {
  NonNegativeInteger,
  PositiveInteger,
  Sha256Hex,
} from "@/core/modules/shared/schema.ts"
import {
  type StationPaymentSnapshot,
  StationPaymentSnapshotSchema,
} from "./station-protocol.ts"
import { receiveStationReports } from "./station-report-actions.ts"
import {
  computeStationReportHash,
  genesisReportHash,
} from "./station-report-utils.ts"
import {
  createStationTestContext,
  type StationTestContext,
} from "./station-test-fixtures.ts"

const stationReportsQuery = createQuery((db) =>
  db.selectFrom("stationReport").select(["seq", "paymentId", "stationPaid"])
)

const snapshotOf = (
  context: StationTestContext,
  overrides: Partial<z.input<typeof StationPaymentSnapshotSchema>> = {}
): StationPaymentSnapshot =>
  StationPaymentSnapshotSchema.parse({
    paymentId: createRowId<"Payment">(),
    stationId: context.stationId,
    employeeId: context.employeeId,
    createdAt: 1_780_000_000_000,
    amount: 10_000,
    currency: "CZK",
    tipAmount: 0,
    canceledAt: null,
    expiresAt: null,
    number: { serialNumber: 7, date: "2026-06-05" },
    cash: null,
    iban: null,
    spark: null,
    settlements: [],
    ...overrides,
  })

/** A `reports` message chaining `snapshots` from seq 1. */
const reportsMessage = (snapshots: ReadonlyArray<StationPaymentSnapshot>) => {
  let prevHash = genesisReportHash
  const reports = snapshots.map((snapshot, index) => {
    const seq = index + 1
    const payload = JSON.stringify(snapshot)
    const hash = computeStationReportHash({ seq, prevHash, payload })
    const report = { seq: PositiveInteger(seq), prevHash, hash, payload }
    prevHash = hash
    return report
  })
  return {
    v: 1 as const,
    type: "reports" as const,
    configHash: null,
    lastSeq: NonNegativeInteger(snapshots.length),
    reports,
  }
}

const settled = (kind: "cashRegister" | "iban" | "spark") => ({
  kind,
  amount: 10_000,
  currency: "CZK" as const,
  occurredAt: 1_780_000_100_000,
  sparkTransferId: kind === "spark" ? "transfer-1" : null,
  preimage: null,
})

describe("receiveStationReports", () => {
  test("stores each report, acks it and projects the payment for the station and employee", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.ownerDeps)
    const snapshot = snapshotOf(context)
    const message = reportsMessage([snapshot])

    expect(
      await run(
        receiveStationReports({ stationId: context.stationId, message })
      )
    ).toEqual({
      ok: true,
      value: [{ seq: 1, hash: message.reports[0]?.hash }],
    })
    expect(
      await context.ownerDeps.evolu.loadQuery(
        paymentByIdQuery(snapshot.paymentId)
      )
    ).toMatchObject([
      {
        stationId: context.stationId,
        employeeId: context.employeeId,
        originCreatedAt: snapshot.createdAt,
        deviceId: null,
        amount: 10_000,
      },
    ])
  })

  test("drops a report whose hash does not hold, unacked", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.ownerDeps)
    const message = reportsMessage([snapshotOf(context)])
    const forged = {
      ...message,
      reports: message.reports.map((report) => ({
        ...report,
        hash: Sha256Hex("f".repeat(64)),
      })),
    }

    expect(
      await run(
        receiveStationReports({ stationId: context.stationId, message: forged })
      )
    ).toEqual({ ok: true, value: [] })
    expect(
      await context.ownerDeps.evolu.loadQuery(stationReportsQuery)
    ).toEqual([])
  })

  test("drops a report about another station", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.ownerDeps)
    const message = reportsMessage([
      snapshotOf(context, { stationId: createRowId<"Station">() }),
    ])

    expect(
      await run(
        receiveStationReports({ stationId: context.stationId, message })
      )
    ).toEqual({ ok: true, value: [] })
  })

  test("stores but never projects onto the owner's own payment", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.ownerDeps)
    const ownPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(300),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
      })
    )

    await run(
      receiveStationReports({
        stationId: context.stationId,
        message: reportsMessage([
          snapshotOf(context, { paymentId: ownPaymentId, amount: 99_999 }),
        ]),
      })
    )

    expect(
      await context.ownerDeps.evolu.loadQuery(stationReportsQuery)
    ).toHaveLength(1)
    expect(
      await context.ownerDeps.evolu.loadQuery(paymentByIdQuery(ownPaymentId))
    ).toMatchObject([{ amount: 300, stationId: null }])
  })

  test("projects the newest report of a payment", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.ownerDeps)
    const first = snapshotOf(context)
    const canceled = snapshotOf(context, {
      ...first,
      canceledAt: 1_780_000_200_000,
    })

    await run(
      receiveStationReports({
        stationId: context.stationId,
        message: reportsMessage([first, canceled]),
      })
    )

    expect(
      await context.ownerDeps.evolu.loadQuery(paymentByIdQuery(first.paymentId))
    ).toMatchObject([{ canceledAt: canceled.canceledAt }])
  })
})

describe("projectStationReport", () => {
  test("settles cash from the report, but bank and Lightning only from the owner's own sync", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.ownerDeps)
    const { evolu } = context.ownerDeps
    const cash = snapshotOf(context, {
      cash: { accountId: context.cashAccountId, receivedAmount: null },
      settlements: [settled("cashRegister")],
    })
    const iban = snapshotOf(context, {
      iban: {
        accountId: context.ibanAccountId,
        variableSymbol: null,
        specificSymbol: null,
      },
      settlements: [settled("iban")],
    })
    const spark = snapshotOf(context, {
      spark: {
        accountId: context.sparkAccountId,
        amountSats: 4_000,
        exchangeRate: 2_500_000,
        exchangeRateSource: "yadio",
        exchangeRateFetchedAt: 1_780_000_000_000,
        lnInvoice: "lnbc40u1station",
        lightningReceiveRequestId: "request-1",
        paymentHash: "hash-1",
      },
      settlements: [settled("spark")],
    })

    await run(
      receiveStationReports({
        stationId: context.stationId,
        message: reportsMessage([cash, iban, spark]),
      })
    )

    expect(
      await evolu.loadQuery(paymentClaimsQuery(cash.paymentId))
    ).toHaveLength(1)
    expect(await evolu.loadQuery(paymentClaimsQuery(iban.paymentId))).toEqual(
      []
    )
    expect(await evolu.loadQuery(paymentClaimsQuery(spark.paymentId))).toEqual(
      []
    )
    expect(await evolu.loadQuery(stationReportsQuery)).toEqual(
      expect.arrayContaining([
        { seq: 2, paymentId: iban.paymentId, stationPaid: 1 },
      ])
    )
  })
})
