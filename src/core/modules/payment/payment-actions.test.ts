import { evoluJsonObjectFrom, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep, FetchDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  createYadioApiDep,
  type YadioApiDep,
} from "@/core/integrations/yadio/yadio-client.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import type { SparkWalletDep } from "@/core/spark/spark-wallet.ts"
import { createFakeSparkWallet } from "@/core/spark/spark-wallet-test-fixtures.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  cancelPayment,
  createPayment,
  createPreparedPayment,
  loadPayment,
  markPaymentPaidCash,
  preparePaymentMethod,
} from "./payment-actions.ts"
import { paymentByIdQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

const fixedDate = new Date("2026-06-05T12:00:00.000Z")

const createDateDeps = (): DateDep => ({
  date: {
    now: () => fixedDate,
  },
})

const paymentWithDetailsByIdQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .select((eb) => [
        "payment.id",
        "payment.deviceId",
        "payment.billId",
        "payment.tableId",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.isDeleted",
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentCashRegister")
            .select([
              "paymentCashRegister.id",
              "paymentCashRegister.accountId",
              "paymentCashRegister.isDeleted",
            ])
            .whereRef("paymentCashRegister.id", "=", "payment.id")
        ).as("cashRegister"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentBtc")
            .leftJoin("paymentBtcLightning", (join) =>
              join
                .onRef("paymentBtcLightning.id", "=", "paymentBtc.id")
                .on("paymentBtcLightning.isDeleted", "is not", 1)
            )
            .leftJoin("paymentBtcSpark", (join) =>
              join
                .onRef("paymentBtcSpark.id", "=", "paymentBtc.id")
                .on("paymentBtcSpark.isDeleted", "is not", 1)
            )
            .select([
              "paymentBtc.id",
              "paymentBtc.accountId",
              "paymentBtc.amountSats",
              "paymentBtc.exchangeRate",
              "paymentBtc.exchangeRateSource",
              "paymentBtc.exchangeRateFetchedAt",
              "paymentBtcLightning.lnInvoice",
              "paymentBtcLightning.lightningReceiveRequestId",
              "paymentBtcLightning.paymentHash",
              "paymentBtcLightning.paymentPreimage",
              "paymentBtcSpark.sparkInvoice",
              "paymentBtc.isDeleted",
            ])
            .whereRef("paymentBtc.id", "=", "payment.id")
        ).as("spark"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentIban")
            .select([
              "paymentIban.id",
              "paymentIban.accountId",
              "paymentIban.variableSymbol",
              "paymentIban.specificSymbol",
              "paymentIban.isDeleted",
            ])
            .whereRef("paymentIban.id", "=", "payment.id")
        ).as("iban"),
      ])
      .where("payment.id", "=", id)
  )

const reconciliationClaimsByPaymentIdQuery = (id: PaymentId) =>
  createQuery((db) =>
    db.selectFrom("reconciliationClaim").selectAll().where("paymentId", "=", id)
  )

const accountTransactionsByPaymentIdQuery = (id: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "reconciliationClaim.accountTransactionId"
      )
      .select([
        "accountTransaction.id",
        "accountTransaction.accountId",
        "accountTransaction.kind",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransaction.occurredAt",
        "accountTransaction.note",
        "accountTransaction.internalTransferGroupId",
      ])
      .where("reconciliationClaim.paymentId", "=", id)
  )

const createPaymentAccounts = async (
  deps: EvoluDep
): Promise<{
  readonly cashRegisterAccountId: AccountId
  readonly sparkAccountId: AccountId
  readonly ibanAccountId: AccountId
}> => {
  await using run = testCreateRun(deps)
  const cashRegisterAccountId = await run.orThrow(
    createAccount({
      deviceId: null,
      name: "Cash register",
      cashRegister: {
        currency: "CZK",
      },
    })
  )
  const sparkAccountId = await run.orThrow(
    createAccount({
      deviceId: null,
      name: "Spark wallet",
      spark: {
        mnemonic:
          "legal winner thank year wave sausage worth useful legal winner thank yellow",
      },
    })
  )
  const ibanAccountId = await run.orThrow(
    createAccount({
      deviceId: null,
      name: "Bank account",
      iban: {
        iban: "CZ6508000000192000145399",
        currency: "CZK",
      },
    })
  )

  return {
    cashRegisterAccountId,
    sparkAccountId,
    ibanAccountId,
  }
}

describe("payment actions", () => {
  test("creates and loads a payment with payment option details through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu, ...createDateDeps() } satisfies EvoluDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, sparkAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 1_000,
        canceledAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
        spark: {
          accountId: sparkAccountId,
          amountSats: 20_000,
          exchangeRate: 1_500_000,
          exchangeRateSource: "yadio",
          exchangeRateFetchedAt: 1_700_000_000_000,
          lightning: {
            lnInvoice: "lnbc200u1test",
            lightningReceiveRequestId: null,
            paymentHash: "abc",
            paymentPreimage: null,
          },
          sparkInvoice: {
            sparkInvoice: "spark-invoice-test",
          },
        },
        iban: {
          accountId: ibanAccountId,
          variableSymbol: "1234567890",
          specificSymbol: "9876543210",
        },
      })
    )

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          billId: null,
          tableId: null,
          amount: 12_900,
          currency: "CZK",
          tipAmount: 1_000,
          canceledAt: null,
          cashRegister: {
            id,
            accountId: cashRegisterAccountId,
          },
          spark: {
            id,
            accountId: sparkAccountId,
            amountSats: 20_000,
            exchangeRate: 1_500_000,
            exchangeRateSource: "yadio",
            exchangeRateFetchedAt: 1_700_000_000_000,
            lnInvoice: "lnbc200u1test",
            sparkInvoice: "spark-invoice-test",
            paymentHash: "abc",
          },
          iban: {
            id,
            accountId: ibanAccountId,
            variableSymbol: "1234567890",
            specificSymbol: "9876543210",
          },
        },
      ])

    await expect
      .poll(() =>
        evolu.loadQuery(
          createQuery((db) =>
            db.selectFrom("paymentNumber").selectAll().where("id", "=", id)
          )
        )
      )
      .toMatchObject([
        {
          id,
          serialNumber: 1,
          date: "2026-06-05",
        },
      ])

    await expect(run(loadPayment(id))).resolves.toMatchObject({
      ok: true,
      value: {
        id,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 1_000,
      },
    })
  }, 15_000)

  test("creates a prepared payment by generating spark payment details", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({
            BTC: 1_500_000,
            timestamp: 1_700_000_000_000,
          })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => ({
              id: "lightning-request-1",
              invoice: {
                encodedInvoice: "lnbc8600n1prepared",
                paymentHash: "payment-hash-1",
              },
              paymentPreimage: "payment-preimage-1",
              sparkInvoice: "spark-invoice-1",
            }),
          }),
      },
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep & DateDep & FetchDep & SparkWalletDep & YadioApiDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, sparkAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const idResult = await run(
      createPreparedPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 1_000,
        canceledAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
        spark: {
          accountId: sparkAccountId,
          memo: "Payment 129 CZK",
        },
        iban: {
          accountId: ibanAccountId,
          variableSymbol: "1234567890",
          specificSymbol: null,
        },
      })
    )

    expect(idResult.ok).toBe(true)
    if (!idResult.ok) return

    const id = idResult.value
    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          amount: 12_900,
          currency: "CZK",
          tipAmount: 1_000,
          cashRegister: {
            id,
            accountId: cashRegisterAccountId,
          },
          spark: {
            id,
            accountId: sparkAccountId,
            amountSats: 8_600,
            exchangeRate: 1_500_000,
            exchangeRateSource: "yadio",
            exchangeRateFetchedAt: 1_700_000_000_000,
            lnInvoice: "lnbc8600n1prepared",
            sparkInvoice: "spark-invoice-1",
            lightningReceiveRequestId: "lightning-request-1",
            paymentHash: "payment-hash-1",
            paymentPreimage: "payment-preimage-1",
          },
          iban: {
            id,
            accountId: ibanAccountId,
            variableSymbol: "1234567890",
            specificSymbol: null,
          },
        },
      ])
  }, 15_000)

  test("prepares payment method details lazily for an existing payment", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({
            BTC: 1_500_000,
            timestamp: 1_700_000_000_000,
          })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => ({
              id: "lightning-request-1",
              invoice: {
                encodedInvoice: "lnbc8600n1lazy",
                paymentHash: "payment-hash-1",
              },
              paymentPreimage: "payment-preimage-1",
              sparkInvoice: "spark-invoice-1",
            }),
          }),
      },
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep & DateDep & FetchDep & SparkWalletDep & YadioApiDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, sparkAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
      })
    )

    await expect(
      run(
        preparePaymentMethod({
          paymentId: id,
          cashRegister: {
            accountId: cashRegisterAccountId,
          },
          bank: {
            accountId: ibanAccountId,
          },
          spark: {
            accountId: sparkAccountId,
          },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          cashRegister: {
            id,
            accountId: cashRegisterAccountId,
          },
          iban: {
            id,
            accountId: ibanAccountId,
            variableSymbol: "1",
            specificSymbol: "260605",
          },
          spark: {
            id,
            accountId: sparkAccountId,
            amountSats: 8_600,
            exchangeRate: 1_500_000,
            exchangeRateSource: "yadio",
            exchangeRateFetchedAt: 1_700_000_000_000,
            lnInvoice: "lnbc8600n1lazy",
            sparkInvoice: "spark-invoice-1",
          },
        },
      ])
  }, 15_000)

  test("prepares Spark payment method when optional Spark SDK fields are null", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      fetch: async () =>
        new Response(
          JSON.stringify({
            BTC: 1_500_000,
            timestamp: 1_700_000_000_000,
          })
        ),
      sparkWallet: {
        create: async () =>
          createFakeSparkWallet({
            createLightningInvoice: async () => ({
              id: null,
              invoice: {
                encodedInvoice: "lnbc8600n1nullable",
                paymentHash: null,
              },
              paymentPreimage: null,
              sparkInvoice: null,
            }),
          }),
      },
      ...createDateDeps(),
      ...createYadioApiDep(),
    } satisfies EvoluDep & DateDep & FetchDep & SparkWalletDep & YadioApiDep
    await using run = testCreateRun(deps)
    const { sparkAccountId } = await createPaymentAccounts(deps)
    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
      })
    )

    await expect(
      run(
        preparePaymentMethod({
          paymentId: id,
          spark: {
            accountId: sparkAccountId,
          },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(paymentWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          spark: {
            id,
            accountId: sparkAccountId,
            lnInvoice: "lnbc8600n1nullable",
            sparkInvoice: null,
            lightningReceiveRequestId: null,
            paymentHash: null,
            paymentPreimage: null,
          },
        },
      ])
  }, 15_000)

  test("marks a payment paid in cash by creating a cash account transaction", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu, ...createDateDeps() } satisfies EvoluDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)
    const occurredAt = TimestampMsSchema.decode(1_700_000_000_000)
    const note = NonEmptyStringSchema.decode("Paid in cash")

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
          occurredAt,
          note,
        })
      )
    ).resolves.toEqual({
      ok: true,
      value: id,
    })

    await expect
      .poll(() => evolu.loadQuery(accountTransactionsByPaymentIdQuery(id)))
      .toMatchObject([
        {
          accountId: cashRegisterAccountId,
          kind: "cashRegister",
          amount: 12_900,
          currency: "CZK",
          occurredAt,
          note,
          internalTransferGroupId: null,
        },
      ])

    const [accountTransaction] = await evolu.loadQuery(
      accountTransactionsByPaymentIdQuery(id)
    )
    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsByPaymentIdQuery(id)))
      .toMatchObject([
        {
          paymentId: id,
          accountTransactionId: accountTransaction?.id,
          source: "manual",
        },
      ])
  }, 15_000)

  test("marking a payment paid in cash twice to the same account does not duplicate the transaction or claim", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu, ...createDateDeps() } satisfies EvoluDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)
    const occurredAt = TimestampMsSchema.decode(1_700_000_000_000)
    const note = NonEmptyStringSchema.decode("Paid in cash")

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
          occurredAt,
          note,
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsByPaymentIdQuery(id)))
      .toHaveLength(1)

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
          occurredAt,
          note,
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    const claims = await evolu.loadQuery(
      reconciliationClaimsByPaymentIdQuery(id)
    )
    expect(claims).toHaveLength(1)

    const transactions = await evolu.loadQuery(
      accountTransactionsByPaymentIdQuery(id)
    )
    expect(transactions).toHaveLength(1)
  }, 15_000)

  test("marking a payment paid in cash to two different accounts creates two transactions and two claims", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu, ...createDateDeps() } satisfies EvoluDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)
    const secondCashRegisterAccountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Second cash register",
        cashRegister: {
          currency: "CZK",
        },
      })
    )
    const occurredAt = TimestampMsSchema.decode(1_700_000_000_000)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
        cashRegister: {
          accountId: cashRegisterAccountId,
        },
      })
    )

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: cashRegisterAccountId,
          occurredAt,
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect(
      run(
        markPaymentPaidCash({
          paymentId: id,
          accountId: secondCashRegisterAccountId,
          occurredAt,
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

    await expect
      .poll(() => evolu.loadQuery(reconciliationClaimsByPaymentIdQuery(id)))
      .toHaveLength(2)

    const transactions = await evolu.loadQuery(
      accountTransactionsByPaymentIdQuery(id)
    )
    expect(transactions).toHaveLength(2)
    expect(transactions.map((t) => t.accountId).toSorted()).toEqual(
      [cashRegisterAccountId, secondCashRegisterAccountId].toSorted()
    )
  }, 15_000)

  test("cancels a payment", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu, ...createDateDeps() } satisfies EvoluDep & DateDep
    await using run = testCreateRun(deps)
    const { ibanAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      createPayment({
        deviceId: null,
        billId: null,
        tableId: null,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 0,
        canceledAt: null,
        iban: {
          accountId: ibanAccountId,
          variableSymbol: undefined,
          specificSymbol: null,
        },
      })
    )

    await expect(run(cancelPayment(id))).resolves.toEqual({
      ok: true,
      value: id,
    })

    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toMatchObject([
        {
          id,
        },
      ])
    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toSatisfy((rows) => rows[0]?.canceledAt !== null)
  }, 15_000)
})
