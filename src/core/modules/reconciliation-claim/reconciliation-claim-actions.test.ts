import type { DisposableRun, TestRunDefaultDeps } from "@evolu/common"
import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import {
  addManualAmountToBill,
  createBill,
} from "@/core/modules/bill/bill-actions.ts"
import {
  loadBillCoverage,
  loadBillStatus,
} from "@/core/modules/bill/bill-guards.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
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
import { createTestDateDep } from "@/test/date-dep.ts"
import { reconcileAccountTransaction } from "./reconciliation-claim-actions.ts"

// `DateDep` included because every test below builds its run with
// `createTestDateDep()`: without it a helper here can only compose the
// actions that happen not to read the clock.
type TestRun = DisposableRun<
  TestRunDefaultDeps & EvoluDep & EvoluOwnerIdDep & DateDep
>

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

/**
 * A 19 950 CZK IBAN payment and one incoming transfer carrying the very same
 * symbols, so the only thing a case varies is the money on the transfer. The
 * symbol pair already matches: what is under test is that matching symbols
 * alone are not enough to claim a payment.
 */
const seedIbanPaymentAndTransfer = async (
  run: TestRun,
  transfer: { readonly amount: Integer; readonly currency: FiatCurrency }
): Promise<{
  readonly paymentId: PaymentId
  readonly accountTransactionId: AccountTransactionId
}> => {
  const accountId = await createIbanAccount(run)
  const paymentId = await run.orThrow(
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
        variableSymbol: VariableSymbol("123456"),
        specificSymbol: SpecificSymbol("260605"),
      },
    })
  )
  const accountTransactionId = await run.ok(
    createAccountTransaction({
      accountId,
      amount: transfer.amount,
      currency: transfer.currency,
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

  return { paymentId, accountTransactionId }
}

describe("reconciliation claim actions", () => {
  test("automatically reconciles a cash register account transaction by amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
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
      ...createTestDateDep(),
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
      ...createTestDateDep(),
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
      ...createTestDateDep(),
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

  test("does not reconcile a cash register account transaction for a different amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createCashRegisterAccount(run)
    await run.orThrow(
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
    // The cash query matches on the drawer and the amount alone (see the
    // note on `cashRegisterReconciliationCandidateByAccountTransactionIdQuery`),
    // so the amount is the whole of what separates this from a false claim.
    const accountTransactionId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(100),
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
      value: null,
    })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([])
  })

  test("does not reconcile an IBAN account transaction for a different amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    // 1 CZK against a 199.50 CZK payment: without the amount check, the right
    // symbols alone would settle the payment — and close its bill — for a
    // hundredth of what was owed.
    const { accountTransactionId } = await seedIbanPaymentAndTransfer(run, {
      amount: Integer(100),
      currency: "CZK",
    })

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

  test("does not reconcile an IBAN account transaction in a different currency", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    // The same number of minor units, but euros against a koruna payment.
    const { accountTransactionId } = await seedIbanPaymentAndTransfer(run, {
      amount: Integer(19_950),
      currency: "EUR",
    })

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

  test("claims the lowest payment id when two pending payments match equally", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createIbanAccount(run)
    const createMatchingPayment = () =>
      run.orThrow(
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
            variableSymbol: VariableSymbol("123456"),
            specificSymbol: SpecificSymbol("260605"),
          },
        })
      )
    const firstPaymentId = await createMatchingPayment()
    const secondPaymentId = await createMatchingPayment()
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

    // Payment ids are random, so the tie-break is `orderBy("payment.id")`,
    // not creation order — the expectation has to be derived the same way
    // rather than assumed to be the payment written first. This pins the
    // outcome, not the clause: SQLite happens to return these rows in id
    // order even with the `orderBy` deleted, so it is the single claim and
    // the deterministic winner that are under test here.
    const expectedPaymentId =
      firstPaymentId < secondPaymentId ? firstPaymentId : secondPaymentId

    await expect(
      run(reconcileAccountTransaction(accountTransactionId))
    ).resolves.toEqual({
      ok: true,
      value: expectedPaymentId,
    })

    // Exactly one claim: the transfer funds one of the two payments, never
    // both.
    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([
        {
          paymentId: expectedPaymentId,
          accountTransactionId,
          source: "auto",
        },
      ])
  })

  test("automatically reconciles a Spark account transaction by LN invoice and sats amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
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
      ...createTestDateDep(),
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

  test("picks the candidate matching the transaction's kind, not the first query", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createIbanAccount(run)

    // Two payments on one account, same amount and currency, differing only in
    // method. `reconcileAccountTransaction` asks all three candidate queries
    // about the same transaction, so this is the case where the answer could
    // come from the wrong one: only the query matching `accountTransaction.kind`
    // may match, and nothing about the order the queries are asked in decides
    // it. Nothing else covers a transaction with a competing candidate.
    const cashRegisterPaymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: NonNegativeInteger(19_950),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: {
          accountId,
        },
      })
    )
    const ibanPaymentId = await run.orThrow(
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
          variableSymbol: VariableSymbol("123456"),
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
          variableSymbol: VariableSymbol("123456"),
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
      value: ibanPaymentId,
    })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsQuery))
      .toEqual([
        {
          paymentId: ibanPaymentId,
          accountTransactionId,
          source: "auto",
        },
      ])
    expect(ibanPaymentId).not.toBe(cashRegisterPaymentId)
  })

  test("automatically reconciling a payment's claim closes its fully covered bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
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

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
  })

  test("a Lightning settlement in satoshis closes its fiat bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await createSparkAccount(run)

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
    // The settlement records satoshis; the bill and the payment are in
    // koruna. Summed raw, 8 600 against a 12 900 total read as underpaid and
    // the bill stayed open — and editable again — for good.
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

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 12_900,
      claimedSum: 12_900,
      coverage: "paid",
    })
  })
})
