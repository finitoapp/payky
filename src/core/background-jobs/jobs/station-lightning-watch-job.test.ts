import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createStationLightningWatchJob } from "@/core/background-jobs/jobs/station-lightning-watch-job.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import { paymentClaimsQuery } from "@/core/modules/payment/payment-queries.ts"
import {
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveNumberSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { applyStationConfig } from "@/core/modules/station/station-config-actions.ts"
import {
  createStationTestContext,
  createTestStationConfigMessage,
} from "@/core/modules/station/station-test-fixtures.ts"
import { createFakeSparkWallet } from "@/core/spark/spark-wallet-test-fixtures.ts"

describe("station lightning watch job", () => {
  test("records an invoice paid once its transfer completes, not when its id shows", async () => {
    let status = "INVOICE_CREATED"
    const asked: string[] = []
    await using context = await createStationTestContext({
      stationWallet: createFakeSparkWallet({
        getLightningReceiveRequest: async (id) => {
          asked.push(id)
          return {
            status,
            paymentPreimage: "preimage-1",
            sparkTransferId: "transfer-1",
          }
        },
      }),
    })
    await using run = testCreateRun(context.stationDeps)
    await run.orThrow(
      applyStationConfig(createTestStationConfigMessage(context))
    )
    const now = context.clock.date.now().getTime()
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(10_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: TimestampMsSchema.decode(now + 15 * 60_000),
        stationId: context.stationId,
        employeeId: null,
        spark: {
          accountId: context.sparkAccountId,
          amountSats: NonNegativeInteger(4_000),
          exchangeRate: PositiveNumberSchema.decode(2_500_000),
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: TimestampMsSchema.decode(now),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc40u1station"),
            lightningReceiveRequestId: NonEmptyStringSchema.decode("request-1"),
          },
        },
      })
    )
    const job = await run.ok(
      createStationLightningWatchJob({ pollIntervalMs: 20 })
    )

    await expect.poll(() => asked.length).toBeGreaterThan(2)
    expect(
      await context.stationDeps.evolu.loadQuery(paymentClaimsQuery(paymentId))
    ).toEqual([])

    status = "TRANSFER_COMPLETED"
    await expect
      .poll(() =>
        context.stationDeps.evolu.loadQuery(paymentClaimsQuery(paymentId))
      )
      .toHaveLength(1)
    await job[Symbol.asyncDispose]()
    expect(asked.every((id) => id === "request-1")).toBe(true)
    expect(context.errors).toEqual([])
  })

  test("still records an invoice paid after the owner disabled Bitcoin", async () => {
    await using context = await createStationTestContext({
      stationWallet: createFakeSparkWallet({
        getLightningReceiveRequest: async () => ({
          status: "TRANSFER_COMPLETED",
          paymentPreimage: "preimage-1",
          sparkTransferId: "transfer-1",
        }),
      }),
    })
    await using run = testCreateRun(context.stationDeps)
    await run.orThrow(
      applyStationConfig(createTestStationConfigMessage(context))
    )
    const now = context.clock.date.now().getTime()
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(10_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: TimestampMsSchema.decode(now + 15 * 60_000),
        stationId: context.stationId,
        employeeId: null,
        spark: {
          accountId: context.sparkAccountId,
          amountSats: NonNegativeInteger(4_000),
          exchangeRate: PositiveNumberSchema.decode(2_500_000),
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: TimestampMsSchema.decode(now),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc40u1station"),
            lightningReceiveRequestId: NonEmptyStringSchema.decode("request-1"),
          },
        },
      })
    )
    await run.orThrow(
      applyStationConfig(
        createTestStationConfigMessage(context, {
          version: 2,
          disabledMethods: ["spark"],
        })
      )
    )

    const job = await run.ok(
      createStationLightningWatchJob({ pollIntervalMs: 20 })
    )
    await expect
      .poll(() =>
        context.stationDeps.evolu.loadQuery(paymentClaimsQuery(paymentId))
      )
      .toHaveLength(1)
    await job[Symbol.asyncDispose]()
    expect(context.errors).toEqual([])
  })
})
