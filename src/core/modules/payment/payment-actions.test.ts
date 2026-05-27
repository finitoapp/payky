import { evoluJsonObjectFrom } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluCli } from "../../evolu/cli-client"
import {
  cancelPayment,
  createPayment,
  loadPayment,
  markPaymentPaid,
} from "./payment-actions.ts"
import { paymentByIdQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

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
        "payment.accountTransactionId",
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
            .selectFrom("paymentSpark")
            .select([
              "paymentSpark.id",
              "paymentSpark.accountId",
              "paymentSpark.amountSats",
              "paymentSpark.exchangeRate",
              "paymentSpark.exchangeRateSource",
              "paymentSpark.exchangeRateFetchedAt",
              "paymentSpark.lnInvoice",
              "paymentSpark.sparkTechnicalData",
              "paymentSpark.isDeleted",
            ])
            .whereRef("paymentSpark.id", "=", "payment.id")
        ).as("spark"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("paymentIban")
            .select([
              "paymentIban.id",
              "paymentIban.accountId",
              "paymentIban.variableSymbol",
              "paymentIban.czQrPayload",
              "paymentIban.isDeleted",
            ])
            .whereRef("paymentIban.id", "=", "payment.id")
        ).as("iban"),
      ])
      .where("payment.id", "=", id)
  )

const createPaymentAccounts = async (
  deps: EvoluDep
): Promise<{
  readonly cashRegisterAccountId: AccountId
  readonly sparkAccountId: AccountId
  readonly ibanAccountId: AccountId
}> => {
  const cashRegisterAccountId = await createAccount(deps)({
    deviceId: null,
    name: "Cash register",
    cashRegister: {
      currency: "CZK",
    },
  })
  const sparkAccountId = await createAccount(deps)({
    deviceId: null,
    name: "Spark wallet",
    spark: {
      mnemonic:
        "legal winner thank year wave sausage worth useful legal winner thank yellow",
    },
  })
  const ibanAccountId = await createAccount(deps)({
    deviceId: null,
    name: "Bank account",
    iban: {
      iban: "CZ6508000000192000145399",
      currency: "CZK",
    },
  })

  return {
    cashRegisterAccountId,
    sparkAccountId,
    ibanAccountId,
  }
}

describe("payment actions", () => {
  test("creates and loads a payment with payment option details through real Evolu", async () => {
    await using testEvolu = await createEvoluCli()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    const { cashRegisterAccountId, sparkAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    const id = await createPayment(deps)({
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
        lnInvoice: "lnbc200u1test",
        sparkTechnicalData: JSON.stringify({ paymentHash: "abc" }),
      },
      iban: {
        accountId: ibanAccountId,
        variableSymbol: "1234567890",
        czQrPayload: "SPD*1.0*ACC:CZ6508000000192000145399*AM:129.00*CC:CZK",
      },
    })

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
          accountTransactionId: null,
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
            sparkTechnicalData: JSON.stringify({ paymentHash: "abc" }),
          },
          iban: {
            id,
            accountId: ibanAccountId,
            variableSymbol: "1234567890",
            czQrPayload:
              "SPD*1.0*ACC:CZ6508000000192000145399*AM:129.00*CC:CZK",
          },
        },
      ])

    await expect(loadPayment(deps)(id)).resolves.toMatchObject({
      ok: true,
      value: {
        id,
        amount: 12_900,
        currency: "CZK",
        tipAmount: 1_000,
      },
    })
  }, 15_000)

  test("marks a payment paid with an account transaction", async () => {
    await using testEvolu = await createEvoluCli()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const id = await createPayment(deps)({
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
    const accountTransactionId = await createAccountTransaction(deps)({
      deviceId: null,
      accountId: cashRegisterAccountId,
      amount: 12_900,
      currency: "CZK",
      occurredAt: Date.now(),
      note: null,
      internalTransferGroupId: null,
    })

    await expect(markPaymentPaid(deps)(id, accountTransactionId)).resolves.toBe(
      id
    )

    await expect
      .poll(() => evolu.loadQuery(paymentByIdQuery(id)))
      .toMatchObject([
        {
          id,
          accountTransactionId,
        },
      ])
  }, 15_000)

  test("cancels a payment", async () => {
    await using testEvolu = await createEvoluCli()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    const { ibanAccountId } = await createPaymentAccounts(deps)

    const id = await createPayment(deps)({
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
        czQrPayload: "SPD*1.0*ACC:CZ6508000000192000145399*AM:129.00*CC:CZK",
      },
    })

    await expect(cancelPayment(deps)(id)).resolves.toBe(id)

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
