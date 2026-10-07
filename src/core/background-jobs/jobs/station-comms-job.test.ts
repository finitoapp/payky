import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createOwnerStationJob } from "@/core/background-jobs/jobs/owner-station-job.ts"
import { createStationCommsJob } from "@/core/background-jobs/jobs/station-comms-job.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  createPayment,
  markPaymentPaidCash,
} from "@/core/modules/payment/payment-actions.ts"
import { paymentClaimsQuery } from "@/core/modules/payment/payment-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { revokeStation } from "@/core/modules/station/station-actions.ts"
import {
  stationConfigQuery,
  unackedStationOutboxQuery,
} from "@/core/modules/station/station-queries.ts"
import {
  createStationTestContext,
  type StationTestContext,
} from "@/core/modules/station/station-test-fixtures.ts"

const ownerPaymentsQuery = createQuery((db) =>
  db
    .selectFrom("payment")
    .select(["id", "stationId", "employeeId", "amount", "deviceId"])
)

const startJobs = async (context: StationTestContext) => {
  const ownerRun = testCreateRun(context.ownerDeps)
  const stationRun = testCreateRun(context.stationDeps)
  const ownerJob = await ownerRun.ok(createOwnerStationJob())
  const stationJob = await stationRun.ok(
    createStationCommsJob({ flushIntervalMs: 50 })
  )
  return {
    [Symbol.asyncDispose]: async () => {
      await stationJob[Symbol.asyncDispose]()
      await ownerJob[Symbol.asyncDispose]()
      await stationRun[Symbol.asyncDispose]()
      await ownerRun[Symbol.asyncDispose]()
    },
  }
}

const takeCashPayment = async (context: StationTestContext) => {
  await using run = testCreateRun(context.stationDeps)
  const paymentId = await run.orThrow(
    createPayment({
      deviceId: null,
      billId: null,
      tableId: null,
      amount: NonNegativeInteger(12_000),
      currency: "CZK",
      tipAmount: NonNegativeInteger(0),
      canceledAt: null,
      expiresAt: null,
      stationId: context.stationId,
      employeeId: context.employeeId,
      cashRegister: { accountId: context.cashAccountId },
    })
  )
  await run.orThrow(
    markPaymentPaidCash({ paymentId, accountId: context.cashAccountId })
  )
  return paymentId
}

describe("station comms job", () => {
  test("runs on the owner's config and reports a paid payment until it is acknowledged", async () => {
    await using context = await createStationTestContext()
    await using _jobs = await startJobs(context)
    const { evolu: stationEvolu } = context.stationDeps
    const { evolu: ownerEvolu } = context.ownerDeps

    await expect
      .poll(() => stationEvolu.loadQuery(stationConfigQuery), {
        timeout: 5_000,
      })
      .toMatchObject([{ stationId: context.stationId, number: 1 }])

    const paymentId = await takeCashPayment(context)

    await expect
      .poll(
        async () =>
          (await ownerEvolu.loadQuery(ownerPaymentsQuery)).filter(
            (row) => row.id === paymentId
          ),
        { timeout: 5_000 }
      )
      .toEqual([
        {
          id: paymentId,
          stationId: context.stationId,
          employeeId: context.employeeId,
          amount: 12_000,
          deviceId: null,
        },
      ])
    await expect
      .poll(() => ownerEvolu.loadQuery(paymentClaimsQuery(paymentId)), {
        timeout: 5_000,
      })
      .toHaveLength(1)
    await expect
      .poll(() => stationEvolu.loadQuery(unackedStationOutboxQuery), {
        timeout: 5_000,
      })
      .toEqual([])
    expect(context.errors).toEqual([])
  }, 20_000)

  test("resends unacknowledged reports", async () => {
    await using context = await createStationTestContext()
    context.relay.setAccepting(false)
    await using _jobs = await startJobs(context)
    const { evolu: stationEvolu } = context.stationDeps

    // Online long enough to get its config, then the relay goes away.
    context.relay.setAccepting(true)
    await expect
      .poll(() => stationEvolu.loadQuery(stationConfigQuery), {
        timeout: 5_000,
      })
      .toHaveLength(1)
    context.relay.setAccepting(false)

    const paymentId = await takeCashPayment(context)
    await expect
      .poll(() => stationEvolu.loadQuery(unackedStationOutboxQuery), {
        timeout: 5_000,
      })
      .toMatchObject([{ paymentId, sentAt: null }])

    context.relay.setAccepting(true)
    await expect
      .poll(() => stationEvolu.loadQuery(unackedStationOutboxQuery), {
        timeout: 5_000,
      })
      .toEqual([])
    expect(context.errors).toEqual([])
  }, 20_000)

  test("leaves the station account when revoked", async () => {
    await using context = await createStationTestContext()
    await using _jobs = await startJobs(context)

    await using ownerRun = testCreateRun(context.ownerDeps)
    await ownerRun.ok(revokeStation(context.stationId))

    await expect
      .poll(() => context.revocations, { timeout: 5_000 })
      .toContain(context.stationId)
  }, 20_000)
})
