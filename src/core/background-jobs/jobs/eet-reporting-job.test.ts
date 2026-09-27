import { sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { AppBackgroundJobContext } from "@/core/background-jobs/background-job-types.ts"
import type { ConnectivityDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import {
  addManualAmountToBill,
  createBill,
} from "@/core/modules/bill/bill-actions.ts"
import { loadBillStatusSnapshot } from "@/core/modules/bill/bill-guards.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  disableEet,
  enableEet,
  selectEetEnvironment,
} from "@/core/modules/eet/eet-actions.ts"
import { eetSaleByPaymentIdQuery } from "@/core/modules/eet/eet-queries.ts"
import {
  configureEet,
  createEetTestContext,
  createTestPayment,
  type EetTestContext,
  settleInCash,
  settleWithLightning,
} from "@/core/modules/eet/eet-test-fixtures.ts"
import {
  cancelPayment,
  markPaymentPaidIban,
} from "@/core/modules/payment/payment-actions.ts"
import { paymentClaimsQuery } from "@/core/modules/payment/payment-queries.ts"
import { derivePaymentStatus } from "@/core/modules/payment/payment-status-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { createRowId } from "@/core/modules/shared/evolu-utils.ts"
import {
  IbanSchema,
  NonEmptyString255,
  NonNegativeInteger,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import {
  createEetReportingJob,
  getEetRetryDelayMs,
} from "./eet-reporting-job.ts"

const allEetSalesQuery = createQuery((db) =>
  db.selectFrom("eetSale").select(["paymentId", "deviceId"])
)

const createConnectivity = (): ConnectivityDep & {
  readonly goOnline: () => void
} => {
  const listeners = new Set<() => void>()
  return {
    connectivity: {
      onOnline: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    goOnline: () => {
      for (const listener of listeners) listener()
    },
  }
}

const startJob = async (
  context: EetTestContext,
  {
    deviceId = context.deviceId,
    connectivity = createConnectivity(),
    retryBaseDelayMs = 10,
  }: {
    readonly deviceId?: DeviceId
    readonly connectivity?: ConnectivityDep
    readonly retryBaseDelayMs?: number
  } = {}
) => {
  const errors: unknown[] = []
  const jobDeps: AppBackgroundJobContext = {
    ...context.deps,
    ...connectivity,
    deviceId,
    onError: (error) => {
      errors.push(error)
    },
  }
  const run = testCreateRun(jobDeps)
  const job = await run.ok(createEetReportingJob({ retryBaseDelayMs }))

  return {
    errors,
    [Symbol.asyncDispose]: async () => {
      await job[Symbol.asyncDispose]()
      await run[Symbol.asyncDispose]()
    },
  }
}

const saleOf = (context: EetTestContext, paymentId: PaymentId) =>
  context.deps.evolu.loadQuery(eetSaleByPaymentIdQuery(paymentId))

const settleLater = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const createTestBill = async (context: EetTestContext): Promise<BillId> => {
  await using run = testCreateRun(context.deps)
  return await run.ok(
    createBill({
      deviceId: context.deviceId,
      displayNumber: PositiveInteger(1),
      label: null,
      tableId: null,
      currency: "CZK",
    })
  )
}

describe("getEetRetryDelayMs", () => {
  test("starts at 30 seconds, doubles, and stops at 15 minutes", () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7].map((attempt) => getEetRetryDelayMs(attempt))
    ).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000])
  })
})

describe("eet reporting job: sale records", () => {
  test("reports a cash payment on a bill", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using job = await startJob(context)
    const billId = await createTestBill(context)
    const paymentId = await createTestPayment(context, { billId })

    await settleInCash(context, paymentId)

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([
        {
          billId,
          method: "cashRegister",
          pok: expect.stringMatching(/-ff$/u),
        },
      ])
    expect(job.errors).toEqual([])
  })

  test("reports a bank payment matched on another device", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using job = await startJob(context)
    await using run = testCreateRun(context.deps)
    const ibanAccountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Bank account"),
        iban: {
          iban: IbanSchema.decode("CZ6508000000192000145399"),
          currency: "CZK",
        },
      })
    )
    const paymentId = await createTestPayment(context)

    await run.orThrow(
      markPaymentPaidIban({
        paymentId,
        accountId: ibanAccountId,
        deviceId: createRowId<"Device">(),
      })
    )

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([{ deviceId: context.deviceId, method: "iban" }])
    expect(job.errors).toEqual([])
  })

  test("reports a keypad Lightning payment without a bill", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using job = await startJob(context)
    const paymentId = await createTestPayment(context)

    await settleWithLightning(context, paymentId)

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([{ billId: null, method: "spark" }])
    expect(job.errors).toEqual([])
  })

  test("reports each payment of a bill paid in two payments", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using job = await startJob(context)
    const billId = await createTestBill(context)
    const first = await createTestPayment(context, { billId, amount: 10_000 })
    const second = await createTestPayment(context, { billId, amount: 15_000 })

    await settleInCash(context, first)
    await settleInCash(context, second)

    await expect
      .poll(() => context.deps.evolu.loadQuery(allEetSalesQuery))
      .toHaveLength(2)
    expect(await saleOf(context, first)).toMatchObject([{ amount: 10_000 }])
    expect(await saleOf(context, second)).toMatchObject([{ amount: 15_000 }])
    expect(job.errors).toEqual([])
  })

  test("never reports a payment settled before EET was enabled", async () => {
    await using context = await createEetTestContext()
    await configureEet(context, { enabled: false })
    await using job = await startJob(context)
    const paymentId = await createTestPayment(context)
    await settleInCash(context, paymentId)
    context.clock.advance(1_000)
    await using run = testCreateRun(context.deps)

    await run.orThrow(enableEet())
    await settleLater(100)

    expect(await context.deps.evolu.loadQuery(allEetSalesQuery)).toEqual([])
    expect(context.responder.requests).toEqual([])
    expect(job.errors).toEqual([])
  })

  test("never reports a payment settled while EET was disabled", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using job = await startJob(context)
    await using run = testCreateRun(context.deps)
    await run.ok(disableEet())
    context.clock.advance(1_000)
    const paymentId = await createTestPayment(context)
    await settleInCash(context, paymentId)
    context.clock.advance(1_000)

    await run.orThrow(enableEet())
    await settleLater(100)

    expect(await context.deps.evolu.loadQuery(allEetSalesQuery)).toEqual([])
    expect(job.errors).toEqual([])
  })

  test("reports a canceled payment that still received money", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using job = await startJob(context)
    await using run = testCreateRun(context.deps)
    const paymentId = await createTestPayment(context)
    await run.orThrow(cancelPayment(paymentId))

    await settleInCash(context, paymentId)

    await expect.poll(() => saleOf(context, paymentId)).toHaveLength(1)
    expect(job.errors).toEqual([])
  })

  test("keeps a euro payment unsent and unsupported", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using job = await startJob(context)
    await using run = testCreateRun(context.deps)
    const euroCashRegister = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Euro cash register"),
        cashRegister: { currency: "EUR" },
      })
    )
    const paymentId = await createTestPayment(context, { currency: "EUR" })

    await settleInCash(context, paymentId, { accountId: euroCashRegister })

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([{ unsupportedReason: "currency", lastAttemptAt: null }])
    await settleLater(100)
    expect(context.responder.requests).toEqual([])
    expect(job.errors).toEqual([])
  })

  test("creates one record when two devices see the same payment", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using originating = await startJob(context)
    await using other = await startJob(context, {
      deviceId: createRowId<"Device">(),
    })
    const paymentId = await createTestPayment(context)

    await settleInCash(context, paymentId)

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([{ pok: expect.any(String) }])
    expect(await context.deps.evolu.loadQuery(allEetSalesQuery)).toEqual([
      { paymentId, deviceId: context.deviceId },
    ])
    expect(context.responder.requests).toHaveLength(1)
    expect([...originating.errors, ...other.errors]).toEqual([])
  })

  test("makes no request while EET is disabled and nothing is pending", async () => {
    await using context = await createEetTestContext()
    await using job = await startJob(context)
    const paymentId = await createTestPayment(context)

    await settleInCash(context, paymentId)
    await settleLater(100)

    expect(context.responder.requests).toEqual([])
    expect(await context.deps.evolu.loadQuery(allEetSalesQuery)).toEqual([])
    expect(job.errors).toEqual([])
  })
})

describe("eet reporting job: delivery", () => {
  const reportOnePayment = async (context: EetTestContext) => {
    const paymentId = await createTestPayment(context)
    await settleInCash(context, paymentId)
    return paymentId
  }

  test("stores the POK and every warning of a confirmation", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    context.responder.answerNext({
      type: "confirm",
      warnings: [{ code: 5, message: "dat_trzby is too old" }],
    })
    await using job = await startJob(context)

    const paymentId = await reportOnePayment(context)

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([
        {
          pok: expect.stringMatching(/-ff$/u),
          warningsJson: JSON.stringify([
            { code: 5, message: "dat_trzby is too old" },
          ]),
        },
      ])
    expect(context.responder.requests).toHaveLength(1)
    expect(job.errors).toEqual([])
  })

  test.each([-1, 8])(
    "retries EET error %i until a POK arrives",
    async (code) => {
      await using context = await createEetTestContext()
      await configureEet(context)
      context.responder.answerNext({ type: "error", code, message: "Later" })
      await using job = await startJob(context)

      const paymentId = await reportOnePayment(context)

      await expect
        .poll(() => saleOf(context, paymentId))
        .toMatchObject([{ pok: expect.any(String), hadUnansweredAttempt: 0 }])
      const [first, second] = context.responder.requests
      expect(second?.data).toEqual(first?.data)
      expect(second?.header.uuid_zpravy).not.toBe(first?.header.uuid_zpravy)
      expect(second?.header.prvni_zaslani).toBe("false")
      expect(job.errors).toEqual([])
    }
  )

  test("retries a timed-out delivery and remembers it went unanswered", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    context.responder.answerNext({ type: "timeout" })
    await using job = await startJob(context)

    const paymentId = await reportOnePayment(context)

    await expect
      .poll(() => saleOf(context, paymentId), { timeout: 3_000 })
      .toMatchObject([
        { pok: expect.any(String), hadUnansweredAttempt: sqliteTrue },
      ])
    expect(context.responder.requests).toHaveLength(2)
    expect(job.errors).toEqual([])
  })

  test.each([
    {
      answer: { type: "error", code: 4, message: "Neplatny podpis" },
      errorType: "EetErrorCode",
    },
    {
      answer: { type: "tamperedConfirmation" },
      errorType: "EetSignatureError",
    },
  ] as const)(
    "rejects $errorType without retrying",
    async ({ answer, errorType }) => {
      await using context = await createEetTestContext()
      await configureEet(context)
      context.responder.answerNext(answer)
      await using job = await startJob(context)

      const paymentId = await reportOnePayment(context)

      await expect
        .poll(() => saleOf(context, paymentId))
        .toMatchObject([
          {
            lastAttemptResult: "rejected",
            lastErrorType: errorType,
            pok: null,
          },
        ])
      await settleLater(100)
      expect(context.responder.requests).toHaveLength(1)
      expect(job.errors).toEqual([])
    }
  )

  test("keeps retrying past the 48-hour deadline", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const paymentId = await reportOnePayment(context)
    context.clock.advance(49 * 60 * 60 * 1000)
    context.responder.answerNext({ type: "networkFailure" })

    await using job = await startJob(context)

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([{ pok: expect.any(String) }])
    expect(context.responder.requests).toHaveLength(2)
    expect(job.errors).toEqual([])
  })

  test("retries at once when the device comes back online", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    context.responder.answerNext({ type: "networkFailure" })
    const connectivity = createConnectivity()
    await using job = await startJob(context, {
      connectivity,
      retryBaseDelayMs: 60_000,
    })

    const paymentId = await reportOnePayment(context)
    await expect.poll(() => context.responder.requests).toHaveLength(1)
    connectivity.goOnline()

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([{ pok: expect.any(String) }])
    expect(job.errors).toEqual([])
  })

  test("never sends a confirmed sale again", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const connectivity = createConnectivity()
    await using job = await startJob(context, { connectivity })

    const paymentId = await reportOnePayment(context)
    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([{ pok: expect.any(String) }])
    connectivity.goOnline()
    await settleLater(100)

    expect(context.responder.requests).toHaveLength(1)
    expect(job.errors).toEqual([])
  })

  test("keeps sandbox sales in the sandbox after switching to production", async () => {
    await using context = await createEetTestContext({
      productionUrl: "https://eet.invalid/production",
    })
    await configureEet(context, { environment: "playground" })
    context.responder.answerNext({ type: "error", code: 8, message: "Later" })
    await using job = await startJob(context)
    const sandboxPayment = await reportOnePayment(context)
    await expect.poll(() => context.responder.requests).toHaveLength(1)
    await using run = testCreateRun(context.deps)

    await run.orThrow(selectEetEnvironment("production"))
    const productionPayment = await reportOnePayment(context)

    await expect
      .poll(() => saleOf(context, sandboxPayment))
      .toMatchObject([{ environment: "playground", pok: expect.any(String) }])
    await expect
      .poll(() => saleOf(context, productionPayment))
      .toMatchObject([{ environment: "production", pok: expect.any(String) }])
    const urlOf = (sequenceNumber: string) =>
      context.responder.requests
        .filter(({ data }) => data.porad_cis === sequenceNumber)
        .map(({ url }) => new URL(url).hostname)
    expect(new Set(urlOf(sandboxPayment))).toEqual(
      new Set(["pg.trzbyeet.gov.cz"])
    )
    expect(urlOf(productionPayment)).toEqual(["eet.invalid"])
    expect(job.errors).toEqual([])
  })

  test("leaves a payment paid and its bill closed when EET rejects the sale", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    context.responder.answerNext({ type: "error", code: 4, message: "Refused" })
    await using job = await startJob(context)
    await using run = testCreateRun(context.deps)
    const billId = await createTestBill(context)
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: context.deviceId,
        totalAmount: NonNegativeInteger(25_000),
        name: NonEmptyString255("Lunch"),
        currency: "CZK",
      })
    )
    const paymentId = await createTestPayment(context, { billId })

    await settleInCash(context, paymentId)

    await expect
      .poll(() => saleOf(context, paymentId))
      .toMatchObject([{ lastAttemptResult: "rejected" }])
    const claims = await context.deps.evolu.loadQuery(
      paymentClaimsQuery(paymentId)
    )
    expect(
      derivePaymentStatus({
        canceledAt: null,
        confirmedPaidAt: null,
        expiresAt: null,
        hasActiveClaim: claims.length > 0,
        now: context.clock.date.now(),
      })
    ).toBe("paid")
    await expect(
      run.orThrow(loadBillStatusSnapshot(billId))
    ).resolves.toMatchObject({
      status: "closed",
      coverage: "paid",
    })
    expect(job.errors).toEqual([])
  })
})
