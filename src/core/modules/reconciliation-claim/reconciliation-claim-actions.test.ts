import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { createPayment } from "@/core/modules/payment/payment-actions.ts"
import { reconcileAccountTransaction } from "./reconciliation-claim-actions.ts"

const createDateDeps = (): DateDep => ({
  date: {
    now: () => new Date("2026-06-05T12:00:00.000Z"),
  },
})

const reconciliationClaimsQuery = createQuery((db) =>
  db
    .selectFrom("reconciliationClaim")
    .select(["paymentId", "accountTransactionId", "source"])
    .where("isDeleted", "is not", 1)
)

const createIbanAccount = async (
  run: ReturnType<typeof testCreateRun>
): Promise<AccountId> =>
  run.orThrow(
    createAccount({
      deviceId: null,
      name: "Bank account",
      iban: {
        iban: "CZ6508000000192000145399",
        currency: "CZK",
      },
    })
  )

const createSparkAccount = async (
  run: ReturnType<typeof testCreateRun>
): Promise<AccountId> =>
  run.orThrow(
    createAccount({
      deviceId: null,
      name: "Spark account",
      spark: {
        mnemonic: "spark mnemonic",
      },
    })
  )

const createCashRegisterAccount = async (
  run: ReturnType<typeof testCreateRun>
): Promise<AccountId> =>
  run.orThrow(
    createAccount({
      deviceId: null,
      name: "Cash register",
      cashRegister: {
        currency: "CZK",
      },
    })
  )

describe("reconciliation claim actions", () => {
  test("automatically reconciles a cash register account transaction by amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu, ...createDateDeps() })
    const accountId = await createCashRegisterAccount(run)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
        cashRegister: {
          accountId,
        },
      })
    )
    const accountTransactionId = await run.orThrow(
      createAccountTransaction({
        accountId,
        amount: 12_900,
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
    await using run = testCreateRun({ evolu, ...createDateDeps() })
    const accountId = await createIbanAccount(run)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 19_950,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: Date.parse("2026-05-26T12:00:00.000Z"),
        iban: {
          accountId,
          variableSymbol: "123456",
          specificSymbol: "260605",
          czQrPayload: "SPD*1.0*ACC:CZ6508000000192000145399*AM:199.50*CC:CZK",
        },
      })
    )
    const accountTransactionId = await run.orThrow(
      createAccountTransaction({
        accountId,
        amount: 19_950,
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        iban: {
          variableSymbol: "123456",
          constantSymbol: null,
          specificSymbol: "260605",
          bankReference: "123456789",
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
    await using run = testCreateRun({ evolu, ...createDateDeps() })
    const accountId = await createIbanAccount(run)
    await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 19_950,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: Date.parse("2026-05-26T12:00:00.000Z"),
        iban: {
          accountId,
          variableSymbol: "123456",
          specificSymbol: "260605",
          czQrPayload: "SPD*1.0*ACC:CZ6508000000192000145399*AM:199.50*CC:CZK",
        },
      })
    )
    const accountTransactionId = await run.orThrow(
      createAccountTransaction({
        accountId,
        amount: 19_950,
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        iban: {
          variableSymbol: "123456",
          constantSymbol: null,
          specificSymbol: "260606",
          bankReference: "123456790",
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
    await using run = testCreateRun({ evolu, ...createDateDeps() })
    const accountId = await createIbanAccount(run)
    await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 19_950,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
        iban: {
          accountId,
          variableSymbol: null,
          specificSymbol: null,
          czQrPayload: "SPD*1.0*ACC:CZ6508000000192000145399*AM:199.50*CC:CZK",
        },
      })
    )
    const accountTransactionId = await run.orThrow(
      createAccountTransaction({
        accountId,
        amount: 19_950,
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
          bankReference: "123456789",
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

  test("automatically reconciles a Spark account transaction by invoice and sats amount", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu, ...createDateDeps() })
    const accountId = await createSparkAccount(run)
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
        spark: {
          accountId,
          amountSats: 8_600,
          exchangeRate: 1_500_000,
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: 1_700_000_000_000,
          lnInvoice: "lnbc8600n1prepared",
          sparkTechnicalData: JSON.stringify({ paymentHash: "payment-hash-1" }),
        },
      })
    )
    const accountTransactionId = await run.orThrow(
      createAccountTransaction({
        accountId,
        amount: 8_600,
        currency: "BTC",
        occurredAt: Date.parse("2026-05-27T10:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        spark: {
          sparkTransferId: "spark-transfer-1",
          lnInvoice: "lnbc8600n1prepared",
          preImage: "preimage-1",
          paymentHash: "payment-hash-1",
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
})
