import type { DisposableRun, TestRunDefaultDeps } from "@evolu/common"
import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import {
  addManualAmountToBill,
  createBill,
} from "@/core/modules/bill/bill-actions.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  IbanSchema,
  Integer,
  NonEmptyString255,
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveInteger,
  PositiveNumber,
  SpecificSymbol,
  TimestampMs,
  VariableSymbol,
} from "@/core/modules/shared/schema.ts"
import { reconcileAccountTransaction } from "./reconciliation-claim-actions.ts"

const createDateDeps = (): DateDep => ({
  date: {
    now: () => new Date("2026-06-05T12:00:00.000Z"),
  },
})

type TestRun = DisposableRun<TestRunDefaultDeps & EvoluDep & EvoluOwnerIdDep>

const reconciliationClaimsQuery = createQuery((db) =>
  db
    .selectFrom("reconciliationClaim")
    .select(["paymentId", "accountTransactionId", "source"])
    .where("isDeleted", "is not", 1)
)

const createIbanAccount = async (run: TestRun): Promise<AccountId> =>
  run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Bank account"),
      iban: {
        iban: IbanSchema.decode("CZ6508000000192000145399"),
        currency: "CZK",
      },
    })
  )

const createSparkAccount = async (run: TestRun): Promise<AccountId> =>
  run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Spark account"),
      spark: {
        secret: SparkSecret("42373a7543db65ae0228ead6c9cbffcc"),
      },
    })
  )

const createCashRegisterAccount = async (run: TestRun): Promise<AccountId> =>
  run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Cash register"),
      cashRegister: {
        currency: "CZK",
      },
    })
  )

describe("reconciliation claim actions", () => {
  test("automatically reconciles a cash register account transaction by amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createCashRegisterAccount(run)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: {
          accountId,
        },
      })
    )
    const accountTransactionId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(12_900),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T12:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
      })
    )

    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: paymentId,
    })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([
        {
          paymentId,
          accountTransactionId,
          source: "auto",
        },
      ])
  })

  test("automatically reconciles an IBAN account transaction by variable symbol and amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createIbanAccount(run)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(19_950),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: Date.parse("2026-05-26T12:00:00.000Z"),
        expiresAt: null,
        iban: {
          accountId,
          variableSymbol: VariableSymbol("123456"),
          specificSymbol: SpecificSymbol("260605"),
        },
      })
    )
    const accountTransactionId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19_950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        iban: {
          variableSymbol: VariableSymbol("123456"),
          constantSymbol: null,
          specificSymbol: SpecificSymbol("260605"),
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )

    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: paymentId,
    })
    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: paymentId,
    })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([
        {
          paymentId,
          accountTransactionId,
          source: "auto",
        },
      ])
  })

  test("does not reconcile an IBAN account transaction with a different specific symbol", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createIbanAccount(run)
    await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(19_950),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: Date.parse("2026-05-26T12:00:00.000Z"),
        expiresAt: null,
        iban: {
          accountId,
          variableSymbol: VariableSymbol("123456"),
          specificSymbol: SpecificSymbol("260605"),
        },
      })
    )
    const accountTransactionId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19_950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        iban: {
          variableSymbol: VariableSymbol("123456"),
          constantSymbol: null,
          specificSymbol: SpecificSymbol("260606"),
          bankReference: NonEmptyString255("123456790"),
        },
      })
    )

    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: null,
    })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([])
  })

  test("does not reconcile an IBAN account transaction without variable symbol", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createIbanAccount(run)
    await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(19_950),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        iban: {
          accountId,
          variableSymbol: null,
          specificSymbol: null,
        },
      })
    )
    const accountTransactionId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19_950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )

    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: null,
    })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([])
  })

  test("automatically reconciles a Spark account transaction by LN invoice and sats amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createSparkAccount(run)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        spark: {
          accountId,
          amountSats: NonNegativeInteger(8_600),
          exchangeRate: PositiveNumber(1_500_000),
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: TimestampMs(1_700_000_000_000),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc8600n1prepared"),
            lightningReceiveRequestId: null,
            paymentHash: NonEmptyStringSchema.decode("payment-hash-1"),
            paymentPreimage: null,
          },
        },
      })
    )
    const accountTransactionId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(8_600),
        currency: "BTC",
        occurredAt: Date.parse("2026-05-27T10:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        spark: {
          sparkTransferId: NonEmptyStringSchema.decode("spark-transfer-1"),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc8600n1prepared"),
            preImage: NonEmptyStringSchema.decode("preimage-1"),
            paymentHash: NonEmptyStringSchema.decode("payment-hash-1"),
          },
        },
      })
    )

    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: paymentId,
    })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([
        {
          paymentId,
          accountTransactionId,
          source: "auto",
        },
      ])
  })

  test("automatically reconciles a Spark account transaction by Spark invoice and sats amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createSparkAccount(run)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        spark: {
          accountId,
          amountSats: NonNegativeInteger(8_600),
          exchangeRate: PositiveNumber(1_500_000),
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: TimestampMs(1_700_000_000_000),
          sparkInvoice: {
            sparkInvoice: NonEmptyStringSchema.decode("spark-invoice-prepared"),
          },
        },
      })
    )
    const accountTransactionId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(8_600),
        currency: "BTC",
        occurredAt: Date.parse("2026-05-27T10:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        spark: {
          sparkTransferId: NonEmptyStringSchema.decode("spark-transfer-1"),
          sparkInvoice: {
            sparkInvoice: NonEmptyStringSchema.decode("spark-invoice-prepared"),
          },
        },
      })
    )

    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: paymentId,
    })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([
        {
          paymentId,
          accountTransactionId,
          source: "auto",
        },
      ])
  })

  test("automatically reconciling a payment's claim closes its fully covered bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createCashRegisterAccount(run)

    const billId = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(12_900),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(12_900),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId },
      })
    )
    const accountTransactionId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(12_900),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T12:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
      })
    )

    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: paymentId,
    })

    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(billId)))
      .toMatchObject([{ id: billId, status: "closed" }])
  })
})
