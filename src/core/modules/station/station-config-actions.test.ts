import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "@/core/evolu/schema.ts"
import { enabledPaymentMethodAccountsQuery } from "@/core/modules/account/account-queries.ts"
import { activeSparkAccountByIdQuery } from "@/core/modules/account/account-spark-queries.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { activeEmployeesQuery } from "@/core/modules/employee/employee-queries.ts"
import {
  createPayment,
  markPaymentPaidIban,
} from "@/core/modules/payment/payment-actions.ts"
import { deriveDefaultSparkWalletSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  Sha256Hex,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  applyStationConfig,
  applyStationSettlement,
  setCurrentEmployee,
} from "./station-config-actions.ts"
import { currentEmployeeQuery, stationConfigQuery } from "./station-queries.ts"
import {
  createStationTestContext,
  createTestStationConfigMessage,
  ownerSparkIdentityPubkey,
} from "./station-test-fixtures.ts"

describe("applyStationConfig", () => {
  test("sets the station up on the owner's accounts, employees and settings", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.stationDeps)
    const { evolu } = context.stationDeps

    expect(
      await run(applyStationConfig(createTestStationConfigMessage(context)))
    ).toEqual({ ok: true, value: true })

    expect(await evolu.loadQuery(stationConfigQuery)).toMatchObject([
      { stationId: context.stationId, number: 1, version: 1 },
    ])
    expect(
      (await evolu.loadQuery(enabledPaymentMethodAccountsQuery))
        .map((account) => account.id)
        .toSorted()
    ).toEqual(
      [
        context.cashAccountId,
        context.ibanAccountId,
        context.sparkAccountId,
      ].toSorted()
    )
    // Its invoices pay the owner's wallet; the secret is the station's own.
    expect(
      await evolu.loadQuery(activeSparkAccountByIdQuery(context.sparkAccountId))
    ).toEqual([
      {
        id: context.sparkAccountId,
        secret: deriveDefaultSparkWalletSecret(context.station.masterKey),
        receiverIdentityPubkey: ownerSparkIdentityPubkey,
      },
    ])
    expect(await evolu.loadQuery(activeEmployeesQuery)).toEqual([
      { id: context.employeeId, name: "Anna" },
    ])
    expect(await evolu.loadQuery(settingsQuery)).toMatchObject([
      {
        fiatCurrency: "CZK",
        enabledHomeModesJson: '["numpad"]',
        defaultPaymentMethod: "cashRegister",
      },
    ])
  })

  test("keeps the newer config and drops the employee the owner removed", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.stationDeps)
    const { evolu } = context.stationDeps
    await run(applyStationConfig(createTestStationConfigMessage(context)))
    await run(setCurrentEmployee(context.employeeId))

    const older = createTestStationConfigMessage(context, {
      version: 0,
      employees: [],
    })
    expect(await run(applyStationConfig(older))).toEqual({
      ok: true,
      value: false,
    })
    expect(await evolu.loadQuery(activeEmployeesQuery)).toHaveLength(1)

    const newer = createTestStationConfigMessage(context, {
      version: 2,
      employees: [],
    })
    expect(await run(applyStationConfig(newer))).toEqual({
      ok: true,
      value: true,
    })
    expect(await evolu.loadQuery(activeEmployeesQuery)).toEqual([])
    expect(await evolu.loadQuery(currentEmployeeQuery)).toEqual([])
  })

  test("refuses a config whose JSON is not what its hash names", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.stationDeps)
    const message = createTestStationConfigMessage(context)

    expect(
      await run(
        applyStationConfig({ ...message, hash: Sha256Hex("0".repeat(64)) })
      )
    ).toMatchObject({ ok: false, error: { reason: "hash" } })
    expect(
      await context.stationDeps.evolu.loadQuery(stationConfigQuery)
    ).toEqual([])
  })
})

describe("applyStationSettlement", () => {
  test("keeps a bank transfer the station confirmed by hand settled once", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.stationDeps)
    const { evolu } = context.stationDeps
    await run.orThrow(
      applyStationConfig(createTestStationConfigMessage(context))
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(5_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        stationId: context.stationId,
        employeeId: context.employeeId,
        iban: {
          accountId: context.ibanAccountId,
          variableSymbol: null,
          specificSymbol: null,
        },
      })
    )
    await run.orThrow(
      markPaymentPaidIban({ paymentId, accountId: context.ibanAccountId })
    )

    await run(
      applyStationSettlement({
        v: 1,
        type: "settled",
        paymentId,
        method: "iban",
        occurredAt: TimestampMsSchema.decode(1_780_000_300_000),
        sparkTransferId: null,
      })
    )

    const settlements = await evolu.loadQuery(
      createQuery((db) =>
        db
          .selectFrom("reconciliationClaim")
          .innerJoin(
            "accountTransaction",
            "accountTransaction.id",
            "reconciliationClaim.accountTransactionId"
          )
          .select(["accountTransaction.amount"])
          .where("reconciliationClaim.paymentId", "=", paymentId)
      )
    )
    expect(settlements).toEqual([{ amount: 5_000 }])
  })
})

describe("setCurrentEmployee", () => {
  test("tags who takes the payments, until cleared", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.stationDeps)
    const { evolu } = context.stationDeps
    await run(applyStationConfig(createTestStationConfigMessage(context)))

    await run(setCurrentEmployee(context.employeeId))
    expect(await evolu.loadQuery(currentEmployeeQuery)).toEqual([
      { id: context.employeeId, name: NonEmptyString255("Anna") },
    ])

    await run(setCurrentEmployee(null))
    expect(await evolu.loadQuery(currentEmployeeQuery)).toEqual([])
  })
})
