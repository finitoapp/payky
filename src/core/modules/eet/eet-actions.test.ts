import { sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "@/core/evolu/schema.ts"
import { createBill } from "@/core/modules/bill/bill-actions.ts"
import { createRowId } from "@/core/modules/shared/evolu-utils.ts"
import {
  NonNegativeInteger,
  PositiveInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import { createTestCertificate } from "@/test/eet-test-certificates.ts"
import {
  createEetSale,
  deliverEetSale,
  disableEet,
  enableEet,
  retryEetSale,
  saveEetEstablishmentId,
  saveEetTipOwner,
  selectEetEnvironment,
  sendEetTestMessage,
  storeEetCertificate,
} from "./eet-actions.ts"
import {
  eetSaleByIdQuery,
  eetSettingsQuery,
  eetSigningCertificateQuery,
} from "./eet-queries.ts"
import {
  configureEet,
  createEetTestContext,
  type EetTestContext,
  eetTestEic,
  getEetTestCertificateFile,
} from "./eet-test-fixtures.ts"
import { type EetEic, EetEstablishmentIdSchema } from "./eet-types.ts"
import { bytesToEetBase64 } from "./eet-utils.ts"

const allEetSalesQuery = createQuery((db) =>
  db.selectFrom("eetSale").selectAll()
)

const createSaleForNewPayment = async (
  context: EetTestContext,
  overrides: Partial<Parameters<typeof createEetSale>[0]["payment"]> = {}
) => {
  await using run = testCreateRun(context.deps)
  const saleId = await run.ok(
    createEetSale({
      payment: {
        id: createRowId<"Payment">(),
        billId: null,
        amount: NonNegativeInteger(25_000),
        tipAmount: NonNegativeInteger(0),
        cashReceivedAmount: null,
        currency: "CZK",
        method: "cashRegister",
        firstClaimedAt: TimestampMs(context.clock.date.now().getTime()),
        ...overrides,
      },
      deviceId: context.deviceId,
    })
  )
  if (saleId === null) throw new Error("Expected a created sale.")
  return saleId
}

describe("enableEet", () => {
  test("names every missing piece of configuration", async () => {
    await using context = await createEetTestContext()
    await using run = testCreateRun(context.deps)

    await expect(run(enableEet())).resolves.toEqual({
      ok: false,
      error: {
        type: "EetConfigurationIncompleteError",
        missing: ["certificate", "establishment"],
      },
    })

    await run.ok(
      storeEetCertificate({
        certificate: await getEetTestCertificateFile(),
        isTestCertificate: false,
      })
    )
    await expect(run(enableEet())).resolves.toMatchObject({
      ok: false,
      error: { missing: ["establishment"] },
    })
  })

  test("refuses an expired certificate", async () => {
    await using context = await createEetTestContext({
      now: new Date("2028-01-01T00:00:00.000Z"),
    })
    await configureEet(context, { enabled: false })
    await using run = testCreateRun(context.deps)

    await expect(run(enableEet())).resolves.toMatchObject({
      ok: false,
      error: { missing: ["certificateExpired"] },
    })
  })

  test("starts at the current moment and stops on disable", async () => {
    await using context = await createEetTestContext()
    await configureEet(context, { enabled: false })
    await using run = testCreateRun(context.deps)

    await expect(run(enableEet())).resolves.toEqual({
      ok: true,
      value: context.clock.date.now().getTime(),
    })
    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSettingsQuery))
      .toMatchObject([{ enabledAt: context.clock.date.now().getTime() }])

    await run.ok(disableEet())
    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSettingsQuery))
      .toMatchObject([{ enabledAt: null }])
  })
})

describe("selectEetEnvironment", () => {
  test("offers only the playground without a production endpoint", async () => {
    await using context = await createEetTestContext()
    await using run = testCreateRun(context.deps)

    await expect(run(selectEetEnvironment("production"))).resolves.toEqual({
      ok: false,
      error: { type: "EetProductionUnavailableError" },
    })
    await expect(run(selectEetEnvironment("playground"))).resolves.toEqual({
      ok: true,
      value: "playground",
    })
  })

  test("refuses production while a test certificate is stored", async () => {
    await using context = await createEetTestContext({
      productionUrl: "https://eet.invalid/production",
    })
    await configureEet(context, { enabled: false, isTestCertificate: true })
    await using run = testCreateRun(context.deps)

    await expect(run(selectEetEnvironment("production"))).resolves.toEqual({
      ok: false,
      error: { type: "EetTestCertificateBlocksProductionError" },
    })
  })

  test("defaults new sales to production when its endpoint is set", async () => {
    await using context = await createEetTestContext({
      productionUrl: "https://eet.invalid/production",
    })
    await using run = testCreateRun(context.deps)
    await run.ok(
      storeEetCertificate({
        certificate: await getEetTestCertificateFile(),
        isTestCertificate: false,
      })
    )
    await run.ok(saveEetEstablishmentId(EetEstablishmentIdSchema.decode("24")))

    const saleId = await createSaleForNewPayment(context)

    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSaleByIdQuery(saleId)))
      .toMatchObject([{ environment: "production" }])
  })
})

describe("storeEetCertificate", () => {
  test("replaces the certificate every later delivery signs with", async () => {
    await using context = await createEetTestContext()
    await using run = testCreateRun(context.deps)
    const first = await getEetTestCertificateFile()
    const secondCertificate = await createTestCertificate({
      subject: { commonName: "CZ9876543210" },
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2027-01-01T00:00:00.000Z"),
    })
    const second = {
      ...first,
      eic: "CZ9876543210" as EetEic,
      certificateDer: secondCertificate.certificateDer,
      privateKeyPkcs8: secondCertificate.privateKeyPkcs8,
    }

    await run.ok(
      storeEetCertificate({ certificate: first, isTestCertificate: false })
    )
    await run.ok(
      storeEetCertificate({ certificate: second, isTestCertificate: false })
    )

    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSigningCertificateQuery))
      .toEqual([
        {
          eic: "CZ9876543210",
          certificateDer: bytesToEetBase64(second.certificateDer),
          privateKeyPkcs8: bytesToEetBase64(second.privateKeyPkcs8),
          isTestCertificate: 0,
        },
      ])
    await expect
      .poll(() =>
        context.deps.evolu.loadQuery(
          createQuery((db) =>
            db
              .selectFrom("eetCertificate")
              .select(["eic", "isDeleted"])
              .orderBy("eic")
          )
        )
      )
      .toEqual([
        { eic: eetTestEic, isDeleted: sqliteTrue },
        { eic: "CZ9876543210", isDeleted: 0 },
      ])
  })
})

describe("createEetSale", () => {
  test("freezes the sale data of a payment", async () => {
    await using context = await createEetTestContext({
      now: new Date("2027-01-09T15:45:36.000Z"),
    })
    await configureEet(context)
    await using run = testCreateRun(context.deps)
    const billId = await run.ok(
      createBill({
        deviceId: context.deviceId,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    const paymentId = createRowId<"Payment">()

    const saleId = await createSaleForNewPayment(context, {
      id: paymentId,
      billId,
    })
    await run.ok(saveEetEstablishmentId(EetEstablishmentIdSchema.decode("77")))

    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSaleByIdQuery(saleId)))
      .toMatchObject([
        {
          paymentId,
          billId,
          deviceId: context.deviceId,
          method: "cashRegister",
          amount: 25_000,
          currency: "CZK",
          environment: "playground",
          eic: eetTestEic,
          establishmentId: "24",
          cashRegisterId: context.deviceId.slice(0, 20),
          sequenceNumber: paymentId,
          saleAt: "2027-01-09T16:45:36+01:00",
          unsupportedReason: null,
          pok: null,
        },
      ])
  })

  test("marks a euro payment unsupported", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)

    const saleId = await createSaleForNewPayment(context, { currency: "EUR" })

    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSaleByIdQuery(saleId)))
      .toMatchObject([{ unsupportedReason: "currency" }])
  })

  test("never rewrites an existing record", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const paymentId = createRowId<"Payment">()
    const saleId = await createSaleForNewPayment(context, { id: paymentId })
    await using run = testCreateRun(context.deps)
    await run.ok(saveEetEstablishmentId(EetEstablishmentIdSchema.decode("77")))

    await createSaleForNewPayment(context, {
      id: paymentId,
      amount: NonNegativeInteger(1),
    })

    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSaleByIdQuery(saleId)))
      .toMatchObject([{ amount: 25_000, establishmentId: "24" }])
    expect(await context.deps.evolu.loadQuery(allEetSalesQuery)).toHaveLength(1)
  })

  test("reports the tip while nobody said who it belongs to", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)

    const saleId = await createSaleForNewPayment(context, {
      tipAmount: NonNegativeInteger(2_000),
    })

    expect(await context.deps.evolu.loadQuery(eetSettingsQuery)).toMatchObject([
      { tipOwner: null },
    ])
    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSaleByIdQuery(saleId)))
      .toMatchObject([{ amount: 25_000 }])
  })

  test("leaves the tip out while tips belong to employees", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using run = testCreateRun(context.deps)
    await run.ok(saveEetTipOwner("employees"))

    const saleId = await createSaleForNewPayment(context, {
      tipAmount: NonNegativeInteger(2_000),
    })
    await run.orThrow(deliverEetSale(saleId))

    expect(await context.deps.evolu.loadQuery(eetSettingsQuery)).toMatchObject([
      { tipOwner: "employees" },
    ])
    expect(context.responder.requests).toMatchObject([
      { data: { celk_trzba: "230.00" } },
    ])
  })

  test("keeps the tip of a sale created before tips went to employees", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const saleId = await createSaleForNewPayment(context, {
      tipAmount: NonNegativeInteger(2_000),
    })
    context.responder.answerNext({ type: "timeout" })
    await using run = testCreateRun(context.deps)

    await run.orThrow(deliverEetSale(saleId))
    await run.ok(saveEetTipOwner("employees"))
    await run.orThrow(retryEetSale(saleId))

    expect(
      context.responder.requests.map(({ data }) => data.celk_trzba)
    ).toEqual(["250.00", "250.00"])
  })

  test.each([
    {
      name: "cash rounded to whole crowns",
      method: "cashRegister",
      amount: 7_890,
      cashReceivedAmount: 7_900,
      reported: "79.00",
    },
    {
      name: "change the customer left",
      method: "cashRegister",
      amount: 7_890,
      cashReceivedAmount: 8_000,
      reported: "80.00",
    },
    {
      name: "a card payment",
      method: "cardSwitchio",
      amount: 7_890,
      cashReceivedAmount: null,
      reported: "78.90",
    },
    {
      name: "cash without a received amount",
      method: "cashRegister",
      amount: 7_890,
      cashReceivedAmount: null,
      reported: "78.90",
    },
  ] as const)(
    "reports what was received for $name",
    async ({ method, amount, cashReceivedAmount, reported }) => {
      await using context = await createEetTestContext()
      await configureEet(context)
      const saleId = await createSaleForNewPayment(context, {
        method,
        amount: NonNegativeInteger(amount),
        cashReceivedAmount:
          cashReceivedAmount === null
            ? null
            : NonNegativeInteger(cashReceivedAmount),
      })
      await using run = testCreateRun(context.deps)

      await run.orThrow(deliverEetSale(saleId))

      expect(context.responder.requests).toMatchObject([
        { data: { celk_trzba: reported } },
      ])
    }
  )

  test("leaves the tip out of the cash received while tips belong to employees", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using run = testCreateRun(context.deps)
    await run.ok(saveEetTipOwner("employees"))
    const saleId = await createSaleForNewPayment(context, {
      amount: NonNegativeInteger(11_000),
      tipAmount: NonNegativeInteger(1_000),
      cashReceivedAmount: NonNegativeInteger(11_000),
    })

    await run.orThrow(deliverEetSale(saleId))

    expect(context.responder.requests).toMatchObject([
      { data: { celk_trzba: "100.00" } },
    ])
  })
})

describe("deliverEetSale", () => {
  test("stores the POK, the time of receipt and every warning", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const saleId = await createSaleForNewPayment(context)
    context.responder.answerNext({
      type: "confirm",
      warnings: [{ code: 4, message: "dat_trzby is in the future" }],
    })
    await using run = testCreateRun(context.deps)

    const outcome = await run.orThrow(deliverEetSale(saleId))

    expect(outcome).toMatchObject({ type: "accepted", isTest: true })
    await expect
      .poll(() => context.deps.evolu.loadQuery(eetSaleByIdQuery(saleId)))
      .toMatchObject([
        {
          pok: expect.stringMatching(/-ff$/u),
          receivedAt: "2026-06-05T14:00:00+02:00",
          isTest: sqliteTrue,
          warningsJson: JSON.stringify([
            { code: 4, message: "dat_trzby is in the future" },
          ]),
          lastAttemptAt: context.clock.date.now().getTime(),
        },
      ])
    expect(context.responder.requests).toMatchObject([
      {
        header: { prvni_zaslani: "true" },
        data: { celk_trzba: "250.00", id_jednotky: "24" },
      },
    ])
    await expect(run(deliverEetSale(saleId))).resolves.toEqual({
      ok: false,
      error: { type: "EetSaleAlreadyConfirmedError", id: saleId },
    })
    expect(context.responder.requests).toHaveLength(1)
  })

  test("refuses a sale another delivery holds", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const saleId = await createSaleForNewPayment(context)
    await using run = testCreateRun(context.deps)

    const result = await context.deps.lockManager.request(
      `eet-sale-${saleId}`,
      async () => await run(deliverEetSale(saleId))
    )

    expect(result).toEqual({
      ok: false,
      error: { type: "EetSaleBusyError", id: saleId },
    })
    expect(context.responder.requests).toEqual([])
  })

  test("keeps the sale data and marks the resend as repeated", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const saleId = await createSaleForNewPayment(context)
    context.responder.answerNext({ type: "timeout" })
    await using run = testCreateRun(context.deps)

    await run.orThrow(deliverEetSale(saleId))
    await run.ok(saveEetEstablishmentId(EetEstablishmentIdSchema.decode("77")))
    await run.orThrow(retryEetSale(saleId))

    const [first, second] = context.responder.requests
    expect(second?.data).toEqual(first?.data)
    expect(second?.header.uuid_zpravy).not.toBe(first?.header.uuid_zpravy)
    expect(first?.header.prvni_zaslani).toBe("true")
    expect(second?.header.prvni_zaslani).toBe("false")
  })
})

describe("retryEetSale", () => {
  test("takes the corrected establishment number when every attempt was rejected", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const saleId = await createSaleForNewPayment(context)
    context.responder.answerNext({
      type: "error",
      code: 6,
      message: "Unknown establishment",
    })
    await using run = testCreateRun(context.deps)

    await expect(run.orThrow(deliverEetSale(saleId))).resolves.toMatchObject({
      type: "rejected",
      code: 6,
    })
    await run.ok(saveEetEstablishmentId(EetEstablishmentIdSchema.decode("77")))
    await expect(run.orThrow(retryEetSale(saleId))).resolves.toMatchObject({
      type: "accepted",
    })

    expect(
      context.responder.requests.map(({ data }) => data.id_jednotky)
    ).toEqual(["24", "77"])
  })

  test("keeps the original data after an attempt without an answer", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const saleId = await createSaleForNewPayment(context)
    context.responder.answerNext(
      { type: "networkFailure" },
      { type: "error", code: 6, message: "Unknown establishment" }
    )
    await using run = testCreateRun(context.deps)

    await run.orThrow(deliverEetSale(saleId))
    await run.orThrow(deliverEetSale(saleId))
    await run.ok(saveEetEstablishmentId(EetEstablishmentIdSchema.decode("77")))
    await run.orThrow(retryEetSale(saleId))

    expect(
      context.responder.requests.map(({ data }) => data.id_jednotky)
    ).toEqual(["24", "24", "24"])
  })

  test("keeps the original data after a confirmation it could not verify", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    const saleId = await createSaleForNewPayment(context)
    context.responder.answerNext({ type: "tamperedConfirmation" })
    await using run = testCreateRun(context.deps)

    await expect(run.orThrow(deliverEetSale(saleId))).resolves.toMatchObject({
      type: "rejected",
      errorType: "EetSignatureError",
    })
    await run.ok(saveEetEstablishmentId(EetEstablishmentIdSchema.decode("77")))
    await run.orThrow(retryEetSale(saleId))

    expect(
      context.responder.requests.map(({ data }) => data.id_jednotky)
    ).toEqual(["24", "24"])
  })

  test("delivers a record created by another device", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using run = testCreateRun(context.deps)
    const saleId = await run.ok(
      createEetSale({
        payment: {
          id: createRowId<"Payment">(),
          billId: null,
          amount: NonNegativeInteger(25_000),
          tipAmount: NonNegativeInteger(0),
          cashReceivedAmount: null,
          currency: "CZK",
          method: "cashRegister",
          firstClaimedAt: TimestampMs(context.clock.date.now().getTime()),
        },
        deviceId: createRowId<"Device">(),
      })
    )
    if (saleId === null) throw new Error("Expected a created sale.")

    await expect(run.orThrow(retryEetSale(saleId))).resolves.toMatchObject({
      type: "accepted",
    })
  })
})

describe("sendEetTestMessage", () => {
  test("runs the connection test in verification mode without a record", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using run = testCreateRun(context.deps)

    const submission = await run.orThrow(
      sendEetTestMessage({ kind: "verification", deviceId: context.deviceId })
    )

    expect(submission.outcome).toMatchObject({ type: "verified" })
    expect(submission.rawRequest).toContain('overeni="true"')
    expect(submission.rawResponse).toContain('kod="0"')
    expect(await context.deps.evolu.loadQuery(allEetSalesQuery)).toEqual([])
  })

  test("shows the EET error of a failed connection test", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    context.responder.answerNext({
      type: "error",
      code: 4,
      message: "Neplatny podpis SOAP zpravy",
    })
    await using run = testCreateRun(context.deps)

    const submission = await run.orThrow(
      sendEetTestMessage({ kind: "verification", deviceId: context.deviceId })
    )

    expect(submission.outcome).toMatchObject({
      type: "rejected",
      code: 4,
      message: "Neplatny podpis SOAP zpravy",
    })
    expect(await context.deps.evolu.loadQuery(allEetSalesQuery)).toEqual([])
  })

  test("sends a test sale to the playground without a record", async () => {
    await using context = await createEetTestContext()
    await configureEet(context)
    await using run = testCreateRun(context.deps)

    const submission = await run.orThrow(
      sendEetTestMessage({ kind: "sale", deviceId: context.deviceId })
    )

    expect(submission.outcome).toMatchObject({
      type: "accepted",
      pok: expect.stringMatching(/-ff$/u),
    })
    expect(submission.rawRequest).toContain("<tns:Trzba")
    expect(submission.rawResponse).toContain("<eet:Potvrzeni")
    expect(await context.deps.evolu.loadQuery(allEetSalesQuery)).toEqual([])
  })

  test("offers no test sale in production", async () => {
    await using context = await createEetTestContext({
      productionUrl: "https://eet.invalid/production",
    })
    await configureEet(context, { environment: "production" })
    await using run = testCreateRun(context.deps)

    await expect(
      run(sendEetTestMessage({ kind: "sale", deviceId: context.deviceId }))
    ).resolves.toEqual({
      ok: false,
      error: { type: "EetTestSaleOutsidePlaygroundError" },
    })
    expect(context.responder.requests).toEqual([])
  })
})
